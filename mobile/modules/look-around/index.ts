/**
 * JS-kant van Apple Look Around (alleen iOS). Ontbreekt de native module
 * (Android, web, een oudere build), dan is `LookAround` null en valt de app
 * terug op het Google-straatbeeld via de backend.
 */
import { requireOptionalNativeModule } from 'expo';

interface LookAroundModule {
  /** Bestands-URI van een momentopname, of null als Apple hier niets heeft. */
  snapshot(lat: number, lon: number, breedte: number, hoogte: number): Promise<string | null>;
  /** Opent het panorama; false als er geen beeld is. */
  open(lat: number, lon: number): Promise<boolean>;
}

export const LookAround = requireOptionalNativeModule<LookAroundModule>('LookAround');
