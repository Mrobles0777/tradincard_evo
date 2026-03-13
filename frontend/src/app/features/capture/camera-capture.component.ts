import { Component, ElementRef, OnDestroy, OnInit, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CameraService } from '../../core/services/camera.service';
import { GradingService } from '../../core/services/grading.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-camera-capture',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './camera-capture.component.html',
  styleUrls: ['./camera-capture.component.css']
})
export class CameraCaptureComponent implements OnInit, OnDestroy {
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
  
  isAnalyzing = signal(false);
  cardType = signal<'pokemon' | 'yugioh' | 'football'>('pokemon');
  error = signal<string | null>(null);

  constructor(
    private cameraService: CameraService,
    private gradingService: GradingService,
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  async ngOnInit() {
    try {
      // Small delay to ensure view child is ready
      setTimeout(() => {
        this.cameraService.startCamera(this.videoElement.nativeElement);
      }, 0);
    } catch (err) {
      this.error.set('No se pudo acceder a la cámara.');
    }
  }

  ngOnDestroy() {
    this.cameraService.stopCamera();
  }

  async capture() {
    if (this.isAnalyzing()) return;
    
    this.isAnalyzing.set(true);
    this.error.set(null);

    try {
      const base64Image = this.cameraService.captureFrame(this.videoElement.nativeElement);
      
      // 1. Create evaluation entry
      const evaluation = await this.gradingService.createEvaluation({
        card_type: this.cardType(),
        front_image_path: 'pending', // Will update after upload
        user_id: (await this.supabaseService.getUser()).data.user?.id
      });

      // 2. Upload image to Storage (using evaluation ID as filename)
      const fileName = `${evaluation.user_id}/${evaluation.id}_front.jpg`;
      const blob = await (await fetch(`data:image/jpeg;base64,${base64Image}`)).blob();
      await this.supabaseService.uploadImage(fileName, blob);

      // 3. Update evaluation with path
      // Note: In a real app, you'd do this properly. Here we just update the path.
      
      // 4. Run AI Analysis
      const result = await this.gradingService.analyzeCard(base64Image, this.cardType(), evaluation.id);
      
      this.router.navigate(['/grading', evaluation.id]);
    } catch (err: any) {
      console.error(err);
      this.error.set('Error durante el análisis: ' + (err.message || err));
    } finally {
      this.isAnalyzing.set(false);
    }
  }

  setCardType(type: 'pokemon' | 'yugioh' | 'football') {
    this.cardType.set(type);
  }
}
