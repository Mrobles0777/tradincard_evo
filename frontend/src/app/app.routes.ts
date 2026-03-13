import { Routes } from '@angular/router';
import { CameraCaptureComponent } from './features/capture/camera-capture.component';
import { GradingResultComponent } from './features/grading/grading-result.component';
import { CollectionListComponent } from './features/collection/collection-list.component';
import { LoginComponent } from './features/auth/login.component';

export const routes: Routes = [
  { path: '', redirectTo: 'capture', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'capture', component: CameraCaptureComponent },
  { path: 'grading/:id', component: GradingResultComponent },
  { path: 'collection', component: CollectionListComponent },
  { path: '**', redirectTo: 'capture' }
];
