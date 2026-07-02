/** points module Zod schemas（积分中心，V0.1.22 B-核心） */
import { z } from 'zod';

export const SigninInputSchema = z.object({}).optional();
export type SigninInput = z.infer<typeof SigninInputSchema>;
