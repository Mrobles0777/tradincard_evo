import { Component, ElementRef, OnDestroy, OnInit, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CameraService } from '../../core/services/camera.service';
import { GradingService } from '../../core/services/grading.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { ImageProcessingService } from '../../core/services/image-processing.service';
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
  isProcessing = signal(false);
  method = signal<'upload' | 'camera'>('upload');
  cardType = signal<'pokemon' | 'yugioh' | 'football'>('pokemon');
  error = signal<string | null>(null);
  previewUrl = signal<string | null>(null);
  selectedBase64: string | null = null;

  constructor(
    private cameraService: CameraService,
    private gradingService: GradingService,
    private supabaseService: SupabaseService,
    private imageProcessingService: ImageProcessingService,
    private router: Router
  ) {}

  ngOnInit() {
    // Camera is no longer started automatically
  }

  ngOnDestroy() {
    this.stopCamera();
  }

  async setMethod(m: 'upload' | 'camera') {
    this.method.set(m);
    this.error.set(null);
    this.previewUrl.set(null);
    this.selectedBase64 = null;
    
    if (m === 'camera') {
      setTimeout(() => {
        if (this.videoElement) {
          this.cameraService.startCamera(this.videoElement.nativeElement);
        }
      }, 100);
    } else {
      this.cameraService.stopCamera();
    }
  }

  stopCamera() {
    this.cameraService.stopCamera();
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        this.error.set('Por favor, selecciona una imagen válida.');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = async () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_DIM = 1200;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_DIM) {
              height *= MAX_DIM / width;
              width = MAX_DIM;
            }
          } else {
            if (height > MAX_DIM) {
              width *= MAX_DIM / height;
              height = MAX_DIM;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/jpeg', 0.8);
            this.previewUrl.set(compressed);
            this.selectedBase64 = compressed.split(',')[1];
          }
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  async capture() {
    if (this.isAnalyzing()) return;
    
    let base64Image = '';
    
    if (this.method() === 'camera') {
      base64Image = this.cameraService.captureFrame(this.videoElement.nativeElement);
    } else {
      if (!this.selectedBase64) {
        this.error.set('Primero selecciona o arrastra una imagen.');
        return;
      }
      base64Image = this.selectedBase64;
    }

    if (!base64Image) {
      this.error.set('No se pudo obtener la imagen.');
      return;
    }

    this.isAnalyzing.set(true);
    this.error.set(null);

    try {
      // 0. Crop and process image
      this.isProcessing.set(true);
      try {
        const fullBase64 = base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${base64Image}`;
        const croppedBase64 = await this.imageProcessingService.detectAndCropCard(fullBase64);
        base64Image = croppedBase64.split(',')[1];
        console.log('[Capture] Cropping successful, sending processed image to AI.');
      } catch (cropErr) {
        console.error('[Capture] Cropping failed, falling back to original:', cropErr);
      } finally {
        this.isProcessing.set(false);
      }

      // 1. Create evaluation entry
      const user = await this.supabaseService.getUser();
      const evaluation = await this.gradingService.createEvaluation({
        card_type: this.cardType(),
        front_image_path: 'pending', // Will update after upload
        user_id: user.data.user?.id
      });

      // 2. Upload image to Storage (using evaluation ID as filename)
      const fileName = `${evaluation.user_id}/${evaluation.id}_front.jpg`;
      const blob = await (await fetch(`data:image/jpeg;base64,${base64Image}`)).blob();

      // Asegurar que usamos el bucket correcto 'card-images'
      const { error: uploadError } = await this.supabaseService.uploadImage(fileName, blob);
      if (uploadError) throw uploadError;

      // 3. Update evaluation with the correct storage path
      await this.supabaseService.client
        .from('evaluations')
        .update({ front_image_path: fileName })
        .eq('id', evaluation.id);

      // 4. Run AI Analysis (Wait for it to finish)
      await this.gradingService.analyzeCard(base64Image, this.cardType(), evaluation.id);

      // Pequeña pausa para asegurar que los triggers y actualizaciones de DB en la Edge Function se propaguen
      await new Promise(resolve => setTimeout(resolve, 1500));

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
