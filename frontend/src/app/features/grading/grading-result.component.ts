import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { GradingService } from '../../core/services/grading.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { GradeBadgeComponent } from './grade-badge.component';

@Component({
  selector: 'app-grading-result',
  standalone: true,
  imports: [CommonModule, RouterModule, GradeBadgeComponent],
  templateUrl: './grading-result.component.html',
  styleUrls: ['./grading-result.component.css']
})
export class GradingResultComponent implements OnInit {
  evaluation = signal<any>(null);
  imageUrl = signal<string | null>(null);
  isLoading = signal(true);

  constructor(
    private route: ActivatedRoute,
    private gradingService: GradingService,
    private supabaseService: SupabaseService
  ) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      try {
        const data = await this.gradingService.getEvaluation(id);
        this.evaluation.set(data);
        
        // Get front image URL
        const fileName = `${data.user_id}/${data.id}_front.jpg`;
        this.imageUrl.set(this.supabaseService.getPublicUrl(fileName));
      } catch (err) {
        console.error(err);
      } finally {
        this.isLoading.set(false);
      }
    }
  }

  getScoreWidth(score: number): string {
    return `${(score / 10) * 100}%`;
  }
}
