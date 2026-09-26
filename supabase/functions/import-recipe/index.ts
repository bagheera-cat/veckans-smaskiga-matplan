// Supabase Edge Function: import-recipe
//
// Tar emot antingen { url } eller { image, mediaType } och returnerar
// strukturerad receptdata: { name, tags, ingredients: [...], instructions }.
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
  "tags": ["kort", "svenska", "taggar", "t.ex. vardag/snabb/vegetariskt, max 4 st"],
  "ingredients": [
    { "name": "ingrediensnamn i grundform, t.ex. 'gul lök' inte 'gula lökar'", "amount": 2, "unit": "dl", "category": "en av kategorierna nedan" }
  ],
  "instructions": "Tillagningsinstruktionerna som brödtext, ett steg per rad (använd \\n mellan stegen)."
}

Regler:
- "amount" ska vara ett tal (använd decimalpunkt, t.ex. 0.5) eller null om ingen mängd anges (t.ex. "salt efter smak"). Om receptet anger ett intervall (t.ex. "4-5 morötter"), välj det högre talet.
- "unit" ska ALLTID sättas till en kort enhet, aldrig null, så länge en mängd anges: g, kg, ml, l, dl, msk, tsk, st, förpackning, klyfta, näve. Om ingrediensen bara räknas i hela stycken utan någon annan enhet framför namnet (t.ex. "2 ägg" eller "1 gul lök"), använd "st" som unit (amount 2, unit "st", name "ägg"). Använd bara unit null när amount också är null (ingen mängd alls anges, t.ex. "salt efter smak").
- Skriv alltid ingrediensnamnet i obestämd singular grundform (t.ex. "gul lök", "vitlöksklyfta", "tomat") så att samma ingrediens från olika recept får exakt samma namn och kan slås ihop i inköpslistan.
- "category" MÅSTE vara exakt en av: ${CATEGORIES.join(", ")}. Välj den som passar bäst.
- "instructions" ska innehålla tillagningsstegen i ordning, som vanlig text (inte en JSON-lista). Om receptet inte har några instruktioner, använd null.
- Om du inte kan hitta ett recept alls, returnera { "name": null, "tags": [], "ingredients": [], "instructions": null }.
- Svara ENDAST med JSON-objektet, ingenting annat.`;

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractJson(raw) {
  var match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Kunde inte tolka AI-svaret som JSON.");
  return JSON.parse(match[0]);
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
      var pageText = stripHtml(html).slice(0, 18000);
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
        max_tokens: 2000,
        messages: [{ role: "user", content: content }]
      })
    });

    if (!aiRes.ok) {
      var errText = await aiRes.text();
      throw new Error("AI-anropet misslyckades (" + aiRes.status + "): " + errText.slice(0, 300));
    }

    var aiData = await aiRes.json();
    var rawText = (aiData.content && aiData.content[0] && aiData.content[0].text) || "";
    var parsed = extractJson(rawText);

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
