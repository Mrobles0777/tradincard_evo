import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';

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

  constructor(private supabaseService: SupabaseService) {}

  async ngOnInit() {
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
}
