import { z } from 'zod'
import { ROLES } from './permissions'

export const passwordSchema = z
  .string()
  .min(10, 'A senha deve ter no minimo 10 caracteres')
  .regex(/[a-z]/, 'A senha deve conter letra minuscula')
  .regex(/[A-Z]/, 'A senha deve conter letra maiuscula')
  .regex(/[0-9]/, 'A senha deve conter numero')

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail valido'),
  password: z.string().min(1, 'Informe a senha'),
})
export type LoginInput = z.infer<typeof loginSchema>

export const createUserSchema = z.object({
  name: z.string().trim().min(3, 'Informe o nome completo').max(120),
  email: z.string().trim().toLowerCase().email('Informe um e-mail valido'),
  password: passwordSchema,
  role: z.enum(ROLES).default('USER'),
})
export type CreateUserInput = z.infer<typeof createUserSchema>

export const updateUserSchema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
})
export type UpdateUserInput = z.infer<typeof updateUserSchema>

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual'),
    newPassword: passwordSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'A nova senha deve ser diferente da atual',
    path: ['newPassword'],
  })
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

/** Admin definindo nova senha para outro usuario (Cadastros > Usuarios). */
export const resetPasswordSchema = z.object({
  newPassword: passwordSchema,
})
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
