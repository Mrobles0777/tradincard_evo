// supabase/functions/grading-analyzer/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PSA_PROMPT = (cardType: string) => `
Eres un experto en grading PSA. Analiza esta carta de ${cardType} y devuelve un JSON con scores (0-10) para: centering, corners, edges, surface. Incluye psa_grade final.
Formato JSON estricto:
{
  "centering": { "score": 0, "front_lr": "50/50", "front_tb": "50/50", "detail": "" },
  "corners": { "score": 0, "detail": "" },
  "edges": { "score": 0, "detail": "" },
  "surface": { "score": 0, "detail": "" },
  "psa_grade": 0,
  "psa_label": "",
  "qualifier": "NONE",
  "confidence": 0
}
`;

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const geminiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!geminiKey) throw new Error("GEMINI_API_KEY no detectada.");

    // Auto-Descubrimiento de Modelos para evitar 404
    console.log("[GEMINI] Buscando modelos disponibles para esta API Key...");
    const modelsReq = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
    const modelsData = await modelsReq.json();
    
    if (!modelsReq.ok) {
       console.error("[GEMINI LIST ERROR]", JSON.stringify(modelsData));
       throw new Error(`Error en API Key al listar modelos: ${modelsData.error?.message}`);
    }

    const availableModels = modelsData.models || [];
    const modelNames = availableModels.map((m: any) => m.name);
    console.log(`[GEMINI] Modelos encontrados (${modelNames.length}). Seleccionando el mejor...`);

    // Priorizar versiones modernas, luego fallbacks antiguos
    const preferredOrder = [
      "models/gemini-2.5-flash",
      "models/gemini-2.0-flash",
      "models/gemini-1.5-flash-latest",
      "models/gemini-1.5-flash",
      "models/gemini-1.5-pro",
      "models/gemini-pro-vision" // Fallback para cuentas antiguas
    ];

    let selectedModel = "";
    for (const pref of preferredOrder) {
      if (modelNames.includes(pref)) {
        selectedModel = pref;
        break;
      }
    }

    if (!selectedModel) {
       // Buscar cualquier modelo que soporte generateContent si no hay coincidencias exactas
       const fallback = availableModels.find((m: any) => 
         m.supportedGenerationMethods?.includes("generateContent")
       );
       if (!fallback) throw new Error("A tu Google API Key no le quedan modelos compatibles con texto/visión.");
       selectedModel = fallback.name;
    }

    console.log(`[GEMINI SELECTED] Usando modelo -> ${selectedModel}`);
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent`;

    const { imageBase64, cardType, evaluationId } = await req.json();
    console.log(`[EXEC] ID: ${evaluationId}, Size: ${imageBase64?.length || 0}`);

    if (!imageBase64) throw new Error("Imagen vacía.");

    const response = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: PSA_PROMPT(cardType) },
            { inline_data: { mime_type: "image/jpeg", data: imageBase64 } }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 500 }
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("[GEMINI ERROR]", JSON.stringify(result));
      return new Response(JSON.stringify({ error: result.error?.message || "Error Gemini API", code: result.error?.code }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Candidato vacío.");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Sin JSON.");
    
    const analysis = JSON.parse(jsonMatch[0]);
    
    const supabase = createClient(supabaseUrl!, supabaseKey!);
    await supabase.from("evaluations").update({
      score_centering: analysis.centering.score,
      score_corners: analysis.corners.score,
      score_edges: analysis.edges.score,
      score_surface: analysis.surface.score,
      psa_grade: analysis.psa_grade,
      ai_analysis: analysis,
      confidence_pct: analysis.confidence || 0,
    }).eq("id", evaluationId);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error(`[FATAL] ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
