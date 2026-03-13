import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
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
export class GradingResultComponent implements OnInit, OnDestroy {
  evaluation = signal<any>(null);
  imageUrl = signal<string | null>(null);
  isLoading = signal(true);
  error = signal<string | null>(null);
  pollingInterval: any;

  constructor(
    private route: ActivatedRoute,
    private gradingService: GradingService,
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.startPolling(id);
    }
  }

  ngOnDestroy() {
    if (this.pollingInterval) clearInterval(this.pollingInterval);
  }

  async startPolling(id: string) {
    this.isLoading.set(true);
    this.error.set(null);
    
    // Attempt to load data immediately
    await this.loadData(id);

    // If no grade is found (AI still processing), start polling
    if (!this.evaluation() || !this.evaluation().psa_grade) {
      let attempts = 0;
      this.pollingInterval = setInterval(async () => {
        attempts++;
        await this.loadData(id);
        
        // Stop if we have a grade
        if (this.evaluation() && this.evaluation().psa_grade) {
          clearInterval(this.pollingInterval);
          this.isLoading.set(false);
          return;
        }

        // Timeout after 30 seconds (15 attempts * 2s)
        if (attempts > 15) {
          clearInterval(this.pollingInterval);
          this.isLoading.set(false);
          this.error.set('La evaluación está tardando más de lo esperado. Por favor, revisa tu conexión o intenta de nuevo más tarde.');
        }
      }, 2000);
    } else {
      this.isLoading.set(false);
    }
  }

  async loadData(id: string) {
    try {
      const data = await this.gradingService.getEvaluation(id);
      if (data) {
        this.evaluation.set(data);
        const fileName = `${data.user_id}/${data.id}_front.jpg`;
        this.imageUrl.set(this.supabaseService.getPublicUrl(fileName));
      }
    } catch (err) {
      console.error('Error loading evaluation:', err);
    }
  }

  getScoreWidth(score: number | undefined | null): string {
    if (score === undefined || score === null) return '0%';
    return `${(score / 10) * 100}%`;
  }
}
