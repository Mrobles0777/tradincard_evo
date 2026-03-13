import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  get client() {
    return this.supabase;
  }

  async signInWithEmail(email: string) {
    return await this.supabase.auth.signInWithOtp({ email });
  }

  async signOut() {
    return await this.supabase.auth.signOut();
  }

  getUser() {
    return this.supabase.auth.getUser();
  }

  // Helper to get public URL of an image
  getPublicUrl(path: string, bucket: string = 'card-images') {
    return this.supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  // Upload image to storage
  async uploadImage(path: string, file: File | Blob) {
    return await this.supabase.storage.from('card-images').upload(path, file);
  }
}
