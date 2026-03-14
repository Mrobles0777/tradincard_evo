// supabase/functions/grading-analyzer/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenAI } from "npm:@google/genai";

const PSA_PROMPT = (cardType: string) => `Analiza pacientemente esta imagen de una carta de ${cardType} para grading PSA. Devuelve estrictamente este JSON y nada más:
{"centering":{"score":0,"front_lr":"50/50","front_tb":"50/50","detail":"..."},"corners":{"score":0,"detail":"..."},"edges":{"score":0,"detail":"..."},"surface":{"score":0,"detail":"..."},"psa_grade":0,"psa_label":"...","qualifier":"NONE","confidence":0}`;

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

    if (!geminiKey) {
      return new Response(JSON.stringify({ error: "Configuración incompleta: falta GEMINI_API_KEY." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { imageBase64, cardType, evaluationId } = await req.json();
    console.log(`[EXEC] Inciando grading ID: ${evaluationId}`);

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No se recibió ninguna imagen." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    let text = "";

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: imageBase64,
                  mimeType: 'image/jpeg'
                }
              },
              { text: PSA_PROMPT(cardType) }
            ]
          }
        ],
        config: {
          temperature: 0.1,
          responseMimeType: "application/json",
        }
      });
      
      text = response.text || "";
    } catch (genErr: any) {
      console.error("[GEMINI SDK ERROR]", genErr);
      return new Response(JSON.stringify({ error: `IA Google Rechazó: ${genErr.message}` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!text) {
       return new Response(JSON.stringify({ error: "La IA no pudo procesar la imagen (respuesta vacía)." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Limpiar bloques de código markdown si la IA los incluyó a pesar de la instrucción
    text = text.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
       console.error("[NO JSON BLOCK]", text);
       return new Response(JSON.stringify({ error: "La IA no devolvió un formato JSON válido.", raw_text: text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let analysis;
    try {
      analysis = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("[PARSE ERROR] Falló parseo de:", jsonMatch[0]);
      return new Response(JSON.stringify({ error: "Error de formato JSON.", raw_text: jsonMatch[0] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    
    const supabase = createClient(supabaseUrl!, supabaseKey!);
    const { error: dbError } = await supabase.from("evaluations").update({
      score_centering: analysis.centering?.score || 0,
      score_corners: analysis.corners?.score || 0,
      score_edges: analysis.edges?.score || 0,
      score_surface: analysis.surface?.score || 0,
      psa_grade: analysis.psa_grade || 0,
      ai_analysis: analysis,
      confidence_pct: analysis.confidence || 0,
    }).eq("id", evaluationId);

    if (dbError) {
       console.error("[DB ERROR]", dbError);
       return new Response(JSON.stringify({ error: `Error guardando resultados: ${dbError.message}` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error(`[FATAL] ${error.message}`);
    return new Response(JSON.stringify({ error: `Error Fatal Función: ${error.message}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

