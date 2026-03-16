import { Injectable } from '@angular/core';

declare var cv: any;

@Injectable({
  providedIn: 'root'
})
export class ImageProcessingService {
  private cvLoaded = false;

  constructor() {}

  async waitForCv(): Promise<void> {
    if (this.cvLoaded) return;
    
    return new Promise((resolve) => {
      const checkCv = () => {
        if (typeof cv !== 'undefined' && cv.Mat) {
          this.cvLoaded = true;
          resolve();
        } else {
          setTimeout(checkCv, 100);
        }
      };
      checkCv();
    });
  }

  async detectAndCropCard(base64Image: string, marginMm: number = 3): Promise<string> {
    await this.waitForCv();

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Could not get canvas context');

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          let src = cv.imread(canvas);
          let gray = new cv.Mat();
          cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
          
          let blurred = new cv.Mat();
          cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
          
          let edged = new cv.Mat();
          cv.Canny(blurred, edged, 50, 150);

          let contours = new cv.MatVector();
          let hierarchy = new cv.Mat();
          cv.findContours(edged, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

          let maxArea = 0;
          let maxContour = null;

          for (let i = 0; i < contours.size(); ++i) {
            let contour = contours.get(i);
            let area = cv.contourArea(contour);
            if (area > maxArea) {
              let peri = cv.arcLength(contour, true);
              let approx = new cv.Mat();
              cv.approxPolyDP(contour, approx, 0.02 * peri, true);
              if (approx.rows === 4) {
                maxArea = area;
                maxContour = approx;
              } else {
                approx.delete();
              }
            }
          }

          if (maxContour && maxArea > (src.rows * src.cols * 0.1)) {
            // Get corners
            let points = [];
            for (let i = 0; i < 4; i++) {
              points.push({ x: maxContour.data32S[i * 2], y: maxContour.data32S[i * 2 + 1] });
            }

            // Sort points: top-left, top-right, bottom-right, bottom-left
            points.sort((a, b) => a.y - b.y);
            let top = points.slice(0, 2).sort((a, b) => a.x - b.x);
            let bottom = points.slice(2, 4).sort((a, b) => a.x - b.x);
            let sortedPoints = [top[0], top[1], bottom[1], bottom[0]];

            // Calculate width and height of the card
            const w1 = Math.hypot(sortedPoints[1].x - sortedPoints[0].x, sortedPoints[1].y - sortedPoints[0].y);
            const w2 = Math.hypot(sortedPoints[2].x - sortedPoints[3].x, sortedPoints[2].y - sortedPoints[3].y);
            const h1 = Math.hypot(sortedPoints[3].x - sortedPoints[0].x, sortedPoints[3].y - sortedPoints[0].y);
            const h2 = Math.hypot(sortedPoints[2].x - sortedPoints[1].x, sortedPoints[2].y - sortedPoints[1].y);
            
            const maxWidth = Math.max(w1, w2);
            const maxHeight = Math.max(h1, h2);

            // Add margin (3mm). Standard card is 63x88mm.
            // Ratio: 3/63 = ~0.047
            const marginX = maxWidth * (marginMm / 63);
            const marginY = maxHeight * (marginMm / 88);

            const dstWidth = maxWidth + 2 * marginX;
            const dstHeight = maxHeight + 2 * marginY;

            let srcCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [
                sortedPoints[0].x, sortedPoints[0].y,
                sortedPoints[1].x, sortedPoints[1].y,
                sortedPoints[2].x, sortedPoints[2].y,
                sortedPoints[3].x, sortedPoints[3].y
            ]);

            let dstCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [
                marginX, marginY,
                dstWidth - marginX, marginY,
                dstWidth - marginX, dstHeight - marginY,
                marginX, dstHeight - marginY
            ]);

            let M = cv.getPerspectiveTransform(srcCoords, dstCoords);
            let dsize = new cv.Size(dstWidth, dstHeight);
            let dst = new cv.Mat();
            cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

            // Output to canvas
            const outCanvas = document.createElement('canvas');
            cv.imshow(outCanvas, dst);
            const resultBase64 = outCanvas.toDataURL('image/jpeg', 0.85);

            // Cleanup
            src.delete(); gray.delete(); blurred.delete(); edged.delete();
            contours.delete(); hierarchy.delete(); dst.delete(); M.delete();
            srcCoords.delete(); dstCoords.delete();
            if (maxContour) maxContour.delete();

            resolve(resultBase64);
          } else {
            // No card detected, return original
            src.delete(); gray.delete(); blurred.delete(); edged.delete();
            contours.delete(); hierarchy.delete();
            if (maxContour) maxContour.delete();
            resolve(base64Image);
          }
        } catch (err) {
          console.error('Error in image processing:', err);
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image for processing'));
      img.src = base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${base64Image}`;
    });
  }
}
