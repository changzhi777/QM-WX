/** address module Zod schemas（V0.1.23） */
import { z } from 'zod';

const addressFields = {
  name: z.string().min(1),
  phone: z.string().regex(/^\d{11}$/, '手机号需 11 位'),
  province: z.string().min(1),
  city: z.string().min(1),
  district: z.string().min(1),
  detail: z.string().min(1),
  isDefault: z.boolean().optional(),
};

export const AddressInputSchema = z.object(addressFields);
export type AddressInput = z.infer<typeof AddressInputSchema>;

export const AddressUpdateSchema = z.object({ id: z.string().min(1), ...addressFields });
export type AddressUpdate = z.infer<typeof AddressUpdateSchema>;
