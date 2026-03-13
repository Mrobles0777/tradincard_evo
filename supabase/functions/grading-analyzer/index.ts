// supabase/functions/grading-analyzer/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PSA_PROMPT = (cardType: string) => `
Eres un experto certificado en grading de cartas coleccionables bajo el sistema PSA.
Analiza esta imagen de una carta de ${cardType} y evalúa con precisión los 4 criterios PSA:

1. CENTRADO (centering): Mide la proporción de bordes izquierdo/derecho y top/bottom.
   - PSA 10: ≤55/45 frontal, ≤75/25 trasera
   - PSA 9: ≤60/40 frontal
   - PSA 8: ≤65/35 frontal
   
2. ESQUINAS (corners): Evalúa filo, redondeo, y desgaste.
   - 10: Perfectamente afiladas bajo lupa
   - 7-9: Micro desgaste apenas visible
   - 1-6: Redondeo notable o fraying

3. BORDES (edges): Astillas, cortes, rugosidad.
   - 10: Integridad perfecta, sin chips
   - 5-9: Mínimas imperfecciones
   - 1-4: Chips visibles o cortes

4. SUPERFICIE (surface): Rayaduras, manchas, brillo original.
   - 10: Lustre original intacto, sin rayaduras
   - 7-9: Micro rayaduras bajo luz directa
   - 1-6: Rayaduras, staining o pérdida de brillo

Responde SOLO en este JSON sin texto adicional:
{
  "centering": { "score": 0.0, "front_lr": "55/45", "front_tb": "52/48", "detail": "" },
  "corners": { "score": 0.0, "detail": "" },
  "edges": { "score": 0.0, "detail": "" },
  "surface": { "score": 0.0, "detail": "" },
  "psa_grade": 0.0,
  "psa_label": "",
  "qualifier": "NONE",
  "confidence": 0,
  "summary": ""
}
`;

serve(async (req) => {
  console.log(`${req.method} request received at ${new Date().toISOString()}`);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { imageBase64, cardType, evaluationId } = body;
    console.log(`Analizando carta ${cardType} para evaluación ${evaluationId}...`);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      console.error("GEMINI_API_KEY no configurado en Supabase Secrets");
      throw new Error("Configuración incompleta: GEMINI_API_KEY falante");
    }

    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: PSA_PROMPT(cardType) },
            { inline_data: { mime_type: "image/jpeg", data: imageBase64 } }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error de Gemini API: ${response.status} - ${errorText}`);
      throw new Error(`Gemini API falló con estado ${response.status}`);
    }

    const geminiData = await response.json();
    
    if (!geminiData.candidates || geminiData.candidates.length === 0) {
      throw new Error("No hubo candidatos de respuesta en Gemini API");
    }

    const text = geminiData.candidates[0].content.parts[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Respuesta no válida de AI:", text);
      throw new Error("El modelo no devolvió un formato JSON válido");
    }
    
    const analysis = JSON.parse(jsonMatch[0]);

    // Calcular grade ponderado
    const scores = [
      analysis.centering.score, 
      analysis.corners.score,
      analysis.edges.score, 
      analysis.surface.score
    ];
    const minScore = Math.min(...scores);
    const avgScore = scores.reduce((a: number, b: number) => a + b) / 4;
    const finalGrade = Math.min(minScore + 0.5, avgScore).toFixed(1);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: updateError } = await supabase.from("evaluations").update({
      score_centering:    analysis.centering.score,
      score_corners:      analysis.corners.score,
      score_edges:        analysis.edges.score,
      score_surface:      analysis.surface.score,
      centering_front_lr: analysis.centering.front_lr,
      centering_front_tb: analysis.centering.front_tb,
      psa_grade:          parseFloat(finalGrade),
      psa_label:          analysis.psa_label,
      psa_qualifier:      analysis.qualifier,
      ai_analysis:        analysis,
      confidence_pct:     analysis.confidence,
      updated_at:         new Date().toISOString()
    }).eq("id", evaluationId);

    if (updateError) {
      console.error("Error actualizando DB:", updateError);
      throw updateError;
    }

    return new Response(JSON.stringify({ ...analysis, final_grade: finalGrade }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Error en Edge Function:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
