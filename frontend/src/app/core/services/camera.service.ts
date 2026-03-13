import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CameraService {
  private stream: MediaStream | null = null;

  async startCamera(videoElement: HTMLVideoElement): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Use back camera by default
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      videoElement.srcObject = this.stream;
      videoElement.play();
    } catch (err) {
      console.error('Error accessing camera:', err);
      throw err;
    }
  }

  stopCamera(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }

  captureFrame(videoElement: HTMLVideoElement): string {
    const canvas = document.createElement('canvas');
    
    // Redimensionar para asegurar que la imagen no exceda los 2MB de límite de Supabase Edge Functions
    const MAX_DIM = 1024;
    let width = videoElement.videoWidth;
    let height = videoElement.videoHeight;

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
      ctx.drawImage(videoElement, 0, 0, width, height);
      // Calidad 0.7 para mayor compresión manteniendo legibilidad
      const base64 = canvas.toDataURL('image/jpeg', 0.7);
      return base64.split(',')[1];
    }
    return '';
  }
}
