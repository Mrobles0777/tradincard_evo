import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class GradingService {
  constructor(private supabase: SupabaseService) {}

  async analyzeCard(imageBase64: string, cardType: 'pokemon' | 'yugioh' | 'football', evaluationId: string) {
    const { data, error } = await this.supabase.client.functions.invoke('grading-analyzer', {
      body: {
        imageBase64,
        cardType,
        evaluationId
      }
    });

    if (error) {
      console.error('[INVOKE ERROR]', error);
      // Intentar extraer el mensaje de error específico del cuerpo de la respuesta 500
      if (error instanceof Error && (error as any).context) {
        try {
          const body = await (error as any).context.json();
          if (body && body.error) throw new Error(body.error);
        } catch (e) {}
      }
      throw error;
    }

    return data;
  }

  async createEvaluation(cardData: any) {
    const { data, error } = await this.supabase.client
      .from('evaluations')
      .insert(cardData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getEvaluation(id: string) {
    const { data, error } = await this.supabase.client
      .from('evaluations')
      .select('*, cards(*)')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async deleteEvaluation(id: string) {
    const { error } = await this.supabase.client
      .from('evaluations')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
}
