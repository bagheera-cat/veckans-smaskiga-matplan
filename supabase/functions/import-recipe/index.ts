// Supabase Edge Function: import-recipe
//
// Tar emot antingen { url } eller { image, mediaType } och returnerar
// strukturerad receptdata: { name, tags, ingredients: [...], instructions }.
// Vid { url } tillkommer även "image_url" (sidans og:image), om en sådan
// hittas och inte verkar orimligt stor (se isReasonableImageSize) — aldrig
// vid { image }, en uppladdad egen bild blir inte automatiskt receptbilden.
//
// Nyckeln till Anthropic-API:et läses från en secret (ANTHROPIC_API_KEY),
// aldrig från klienten — det är hela poängen med att detta ligger i en
// Edge Function och inte i webbsidan.

const CATEGORIES = ["Frukt & grönt", "Kött & fisk", "Mejeri & ägg", "Bröd", "Skafferi", "Kryddor", "Fryst", "Övrigt"];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const PROMPT = `Du läser ett recept (antingen från text som klippts ur en webbsida, eller från en bild av en receptsida/kokbokssida) och returnerar det som strukturerad JSON. Följ EXAKT detta format, utan förklarande text runtomkring, utan markdown-kodblock:

{
  "name": "Receptets namn",
  "servings": 4,
  "tags": ["kort", "svenska", "taggar", "t.ex. vardag/snabb/vegetariskt, max 4 st"],
  "ingredients": [
    { "name": "ingrediensnamn i grundform, t.ex. 'gul lök' inte 'gula lökar'", "amount": 2, "unit": "dl", "category": "en av kategorierna nedan", "group": null }
  ],
  "instructions": "Tillagningsinstruktionerna som brödtext, ett steg per rad (använd \\n mellan stegen), utan egen radnumrering."
}

Regler:
- "servings" ska vara ett heltal — antalet portioner receptet är beräknat för, t.ex. hämtat från text som "4 portioner", "Recept för 2 personer" eller en portions-väljare på sidan. Om receptet anger ett intervall (t.ex. "4-6 portioner"), välj det lägre talet. Om ingen portionsuppgift alls går att hitta i receptet, använd null.
- "amount" ska vara ett tal (använd decimalpunkt, t.ex. 0.5) eller null om ingen mängd anges (t.ex. "salt efter smak"). Om receptet anger ett intervall (t.ex. "4-5 morötter"), välj det högre talet.
- "unit" ska ALLTID sättas till en kort enhet, aldrig null, så länge en mängd anges: g, kg, ml, l, dl, msk, tsk, st, förp, klyfta, näve. Om ingrediensen bara räknas i hela stycken utan någon annan enhet framför namnet (t.ex. "2 ägg" eller "1 gul lök"), använd "st" som unit (amount 2, unit "st", name "ägg"). Använd bara unit null när amount också är null (ingen mängd alls anges, t.ex. "salt efter smak").
- Om unit är "förp" och receptet anger (eller det är känt) hur stor förpackningen är — t.ex. "1 förp majskorn (à 150 g)" eller "1 burk krossade tomater (400 g)" — MÅSTE den storleken bevaras genom att läggas sist i "name" inom parentes, i formatet "(à <storlek> <enhet>)", t.ex. name: "majskorn (à 150 g)". Detta är viktigt för att man ska veta exakt vilken förpackningsstorlek som ska köpas. Om receptet inte anger någon förpackningsstorlek alls, lägg inte till någon parentes.
- Skriv alltid ingrediensnamnet i obestämd singular grundform (t.ex. "gul lök", "vitlöksklyfta", "tomat") så att samma ingrediens från olika recept får exakt samma namn och kan slås ihop i inköpslistan.
- "category" MÅSTE vara exakt en av: ${CATEGORIES.join(", ")}. Välj den som passar bäst.
- "group" ska vara null för de allra flesta ingredienser (huvudreceptets ingredienser, i en enda lista precis som vanligt). Sätt bara "group" till ett kort namn (t.ex. "Aioli", "Dressing", "Fyllning", "Garnering") för de ingredienser som i KÄLLAN faktiskt står listade under en egen namngiven underrubrik, skild från huvudingredienserna. Hitta ALDRIG på en uppdelning själv — bara spegla en uppdelning som redan finns i receptet. Om receptet bara har en enda ingredienslista, ska alla ingredienser ha "group": null.
- "instructions" ska innehålla tillagningsstegen i ordning, som vanlig text, ETT STEG PER RAD (skilj raderna åt med \\n). Skriv bara själva steget på varje rad — lägg INTE till egen numrering, punktlistetecken eller "Steg 1:" framför, även om källan har det (sidan som visar receptet numrerar stegen själv). Följ KÄLLANS egen indelning i steg EXAKT — en rad i utdatan ska motsvara precis ett steg/en punkt i källan, inte en mening. Radbrytningarna i sidans textinnehåll (när det är en länk-import) markerar var sidans egna listpunkter/stycken går — använd dem som facit för var ett steg slutar och nästa börjar. Om ett steg i källan innehåller flera meningar (t.ex. "Sätt ugnen på 225°C. Smörj formen med olja."), ska HELA det steget vara kvar på samma rad — dela ALDRIG upp ett steg i flera rader bara för att det har flera meningar. Om källan saknar tydlig stegindelning (löpande text utan numrering eller styckesbrytningar), dela då själv upp texten i rimliga steg. Om receptet inte har några instruktioner, använd null.
- Om du inte kan hitta ett recept alls, returnera { "name": null, "servings": null, "tags": [], "ingredients": [], "instructions": null }.
- Svara ENDAST med JSON-objektet, ingenting annat.`;

// Görs om HTML till läsbar text, men bevarar sidans rad-/styckeindelning
// (varje <li>, <p>, <br>, <div> osv. blir en egen rad i utdatan) i stället
// för att slå ihop allt till en enda lång rad. Det är avgörande för
// tillagningsinstruktioner: många receptsidor lägger varje steg i ett eget
// listelement, och om den gränsen försvinner innan texten når AI:n måste
// den gissa var ett steg slutar och nästa börjar — då delar den ofta upp
// varje MENING som ett eget steg i stället för att följa sidans faktiska
// stegindelning.
var BLOCK_END_TAGS = /<\/(li|p|div|tr|h[1-6]|section|article|ul|ol|table)\s*>/gi;
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(BLOCK_END_TAGS, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractJson(raw) {
  var match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Kunde inte tolka AI-svaret som JSON.");
  return JSON.parse(match[0]);
}

// Plockar ut sidans "hero"-bild (och därmed troligen receptbilden) ur
// og:image/twitter:image-metataggar, innan HTML:en städas bort för
// textutdraget. Görs deterministiskt utan AI — sidor lägger nästan alltid
// receptbilden här. Bara relevant för länk-importen, aldrig för uppladdade
// egna bilder (de ska inte automatiskt bli receptbilden).
function extractImageUrl(html, baseUrl) {
  var patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = html.match(patterns[i]);
    if (m && m[1]) {
      try { return new URL(m[1], baseUrl).href; } catch (e) { return m[1]; }
    }
  }
  return null;
}

// Vissa sidor (särskilt WordPress-bloggar) lägger en oskalad originalbild
// rakt av som og:image — kan vara tiotals MB. Att sätta en sådan bild
// direkt som receptbild får mobila webbläsare att krascha när den ska
// avkodas för miniatyrer/förhandsvisning. Kolla filstorleken med HEAD
// innan bilden accepteras automatiskt; är den okänd (servern svarar inte
// med content-length) släpps den ändå igenom, eftersom de allra flesta
// sidor redan serverar en rimligt skalad bild här.
var MAX_AUTO_IMAGE_BYTES = 4 * 1024 * 1024;
async function isReasonableImageSize(url) {
  try {
    var res = await fetch(url, { method: "HEAD", headers: { "User-Agent": "Mozilla/5.0 (compatible; MiddagsbankenBot/1.0)" } });
    if (!res.ok) return true;
    var len = res.headers.get("content-length");
    if (!len) return true;
    return Number(len) <= MAX_AUTO_IMAGE_BYTES;
  } catch (e) {
    return true;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    if (req.method !== "POST") throw new Error("Endast POST stöds.");

    var apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY är inte satt som secret i Supabase.");

    var body = await req.json();
    var content;

    if (body.image) {
      content = [
        { type: "text", text: PROMPT },
        { type: "image", source: { type: "base64", media_type: body.mediaType || "image/jpeg", data: body.image } }
      ];
    } else if (body.url) {
      var pageRes = await fetch(body.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MiddagsbankenBot/1.0)" }
      });
      if (!pageRes.ok) throw new Error("Kunde inte hämta sidan (status " + pageRes.status + ").");
      var html = await pageRes.text();
      var imageUrl = extractImageUrl(html, body.url);
      // Görs i bakgrunden medan sidtexten skickas till AI:n, så vi inte
      // lägger till extra väntetid för det vanliga fallet.
      var imageOkPromise = imageUrl ? isReasonableImageSize(imageUrl) : Promise.resolve(false);
      // 18000 tecken visade sig för snålt för sidor med mycket text innan
      // själva receptet (meny, kakbanner, "andra läser"-listor osv.) eller
      // recept med flera delar (t.ex. huvudrätt + tillbehörssallad) — då
      // riskerade slutet av receptet (instruktionerna) att klippas bort
      // innan det ens nådde AI:n.
      var pageText = stripHtml(html).slice(0, 28000);
      if (!pageText) throw new Error("Sidan verkar sakna textinnehåll.");
      content = [{ type: "text", text: PROMPT + "\n\nHär är sidans textinnehåll:\n\n" + pageText }];
    } else {
      throw new Error("Skicka antingen { url } eller { image, mediaType }.");
    }

    var aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        // Höjt från 2000: recept med flera delar (t.ex. huvudrätt + en egen
        // tillbehörssallad, vardera med sin ingredienslista och sina steg)
        // gav ett svar som klipptes av mitt i JSON:en, vilket gjorde att
        // den inte gick att tolka alls.
        max_tokens: 4000,
        messages: [{ role: "user", content: content }]
      })
    });

    if (!aiRes.ok) {
      var errText = await aiRes.text();
      throw new Error("AI-anropet misslyckades (" + aiRes.status + "): " + errText.slice(0, 300));
    }

    var aiData = await aiRes.json();
    var rawText = (aiData.content && aiData.content[0] && aiData.content[0].text) || "";
    // Om svaret klipptes av (för stort recept, t.ex. flera delar med många
    // ingredienser och steg) blir rawText ogiltig/ofullständig JSON — ge ett
    // begripligt felmeddelande i stället för den kryptiska JSON-parsningen.
    if (aiData.stop_reason === "max_tokens") {
      throw new Error("Receptet är för stort/komplext för att tolkas i ett svep (för många ingredienser eller steg). Pröva att lägga in det manuellt, eller dela upp det i flera recept.");
    }
    var parsed = extractJson(rawText);
    // Bara satt för länk-importen (se ovan) — en uppladdad egen bild av
    // receptet ska aldrig automatiskt bli receptets bild. Sätts inte heller
    // om bilden verkar orimligt stor (se isReasonableImageSize ovan).
    if (typeof imageUrl !== "undefined" && imageUrl && (await imageOkPromise)) parsed.image_url = imageUrl;

    return new Response(JSON.stringify(parsed), {
      headers: Object.assign({ "content-type": "application/json" }, CORS_HEADERS)
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err && err.message) || err) }), {
      status: 400,
      headers: Object.assign({ "content-type": "application/json" }, CORS_HEADERS)
    });
  }
});
