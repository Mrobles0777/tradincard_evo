// supabase/functions/grading-analyzer/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenAI } from "npm:@google/genai";

const PSA_PROMPT = (cardType: string) => `Analiza pacientemente esta imagen de una carta de ${cardType} para grading PSA. 
REGLA CRÍTICA DE NOTA: Si la carta presenta CUALQUIER tipo de arruga, quiebre, doblez o daño estructural (creases/wrinkles), la nota final (psa_grade) NO PUEDE SER MAYOR A 5.0, sin importar qué tan perfecta esté el resto de la carta.

Devuelve estrictamente este JSON en ESPAÑOL (todos los campos "detail", "psa_label" y "summary"):
{
  "centering": {"score": 0, "front_lr": "50/50", "front_tb": "50/50", "detail": "Detalle del centrado en español..."},
  "corners": {"score": 0, "detail": "Detalle de las esquinas en español..."},
  "edges": {"score": 0, "detail": "Detalle de los bordes en español..."},
  "surface": {"score": 0, "detail": "Detalle de la superficie y daños en español..."},
  "psa_grade": 1,
  "psa_label": "Etiqueta PSA en español (ej: Gema Menta, Cerca de Menta, etc)",
  "qualifier": "NONE",
  "confidence": 0,
  "summary": "Resumen general de la evaluación en español..."
}`;

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

    if (!geminiKey || !supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: "Configuración incompleta: faltan variables de entorno." }), { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const { imageBase64, cardType, evaluationId } = await req.json();
    console.log(`[EXEC] Iniciando grading ID: ${evaluationId}`);

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No se recibió ninguna imagen." }), { 
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const ai = new GoogleGenAI(geminiKey);
    // Cambiar a un modelo estable y conocido
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    let analysis;
    try {
      const result = await model.generateContent([
        {
          inlineData: {
            data: imageBase64,
            mimeType: 'image/jpeg'
          }
        },
        { text: PSA_PROMPT(cardType) }
      ]);
      
      const response = result.response;
      const text = response.text().replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("La IA no devolvió un formato JSON válido.");
      
      analysis = JSON.parse(jsonMatch[0]);
    } catch (genErr: any) {
      console.error("[GEMINI ERROR]", genErr);
      return new Response(JSON.stringify({ error: `IA Google Rechazó: ${genErr.message}` }), { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    if (!analysis) {
       return new Response(JSON.stringify({ error: "La IA no pudo procesar la imagen." }), { 
         status: 500,
         headers: { ...corsHeaders, "Content-Type": "application/json" } 
       });
    }
    
    let confidenceVal = analysis.confidence || 0;
    if (confidenceVal <= 1 && confidenceVal > 0) {
      confidenceVal = confidenceVal * 100; // Convert 0.95 to 95
    }
    confidenceVal = Math.round(confidenceVal);

    const supabase = createClient(supabaseUrl!, supabaseKey!);
    const { error: dbError } = await supabase.from("evaluations").update({
      score_centering: analysis.centering?.score || 0,
      score_corners: analysis.corners?.score || 0,
      score_edges: analysis.edges?.score || 0,
      score_surface: analysis.surface?.score || 0,
      psa_grade: analysis.psa_grade || 0,
      psa_label: analysis.psa_label || "",
      ai_analysis: analysis,
      confidence_pct: confidenceVal,
    }).eq("id", evaluationId);

    if (dbError) {
       console.error("[DB ERROR]", dbError);
       return new Response(JSON.stringify({ error: `Error guardando resultados: ${dbError.message}` }), { 
         status: 500,
         headers: { ...corsHeaders, "Content-Type": "application/json" } 
       });
    }

    return new Response(JSON.stringify({ success: true, analysis }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error(`[FATAL] ${error.message}`);
    return new Response(JSON.stringify({ error: `Error Fatal Función: ${error.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

