import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { GradingService } from '../../core/services/grading.service';

@Component({
  selector: 'app-collection-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './collection-list.component.html',
  styleUrls: ['./collection-list.component.css']
})
export class CollectionListComponent implements OnInit {
  evaluations = signal<any[]>([]);
  isLoading = signal(true);

  constructor(private supabaseService: SupabaseService, private gradingService: GradingService) {}

  async ngOnInit() {
    await this.fetchEvaluations();
  }

  async fetchEvaluations() {
    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabaseService.client
        .from('evaluations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const evalsWithUrls = data.map(ev => ({
        ...ev,
        thumbnailUrl: this.supabaseService.getPublicUrl(`${ev.user_id}/${ev.id}_front.jpg`)
      }));

      this.evaluations.set(evalsWithUrls);
    } catch (err) {
      console.error(err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async deleteEvaluation(event: Event, id: string) {
    event.stopPropagation(); // Evitar navegar al detalle al borrar
    if (!confirm('¿Estás seguro de que quieres borrar esta evaluación?')) return;

    try {
      await this.gradingService.deleteEvaluation(id);
      this.evaluations.update(prev => prev.filter(ev => ev.id !== id));
    } catch (err) {
      console.error('Error al borrar:', err);
      alert('No se pudo borrar la evaluación.');
    }
  }
}
