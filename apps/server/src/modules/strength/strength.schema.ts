/** strength module Zod schemas（V0.2.42）*/
import { z } from 'zod';

export const AddSetSchema = z.object({
  sessionId: z.string().min(1),
  exerciseName: z.string().min(1),
  exerciseId: z.string().optional(),
  reps: z.coerce.number().int().positive(),
  weight: z.coerce.number().min(0),
  setIndex: z.coerce.number().int().min(1),
  restSec: z.coerce.number().int().min(0).optional(),
});

export const FinishSessionSchema = z.object({
  sessionId: z.string().min(1),
  durationSec: z.coerce.number().int().min(0).optional(),
  notes: z.string().max(500).optional(),
});

export const SessionDetailSchema = z.object({
  sessionId: z.string().min(1),
});

export const ListSessionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const MyVolumeSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const ListExercisesSchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
});
