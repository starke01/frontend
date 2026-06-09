// app/lib/api-schemas/idw-query-schema.ts
import { z } from 'zod'
import { type DeviceExposureType } from '~/db/schema'
import { StandardResponse } from '~/lib/responses'

const IdwQuerySchema = z.object({
  phenomenon: z.string({
    error: () => 'phenomenon is required',
  }),

  bbox: z
    .union([
      z.string().transform((s) => s.split(',').map((x) => Number(x.trim()))),
      z
        .array(z.union([z.string(), z.number()]))
        .transform((arr) => arr.map((x) => Number(x))),
    ])
    .refine((arr) => arr.length === 4 && arr.every((n) => !isNaN(n)), {
      message: 'bbox must contain exactly 4 numeric coordinates',
    }),

  exposure: z
    .union([
      z
        .string()
        .transform((s) =>
          s.split(',').map((x) => x.trim() as DeviceExposureType),
        ),
      z
        .array(z.string())
        .transform((arr) =>
          arr.map((s) => String(s).trim() as DeviceExposureType),
        ),
    ])
    .optional(),

  gridType: z.enum(['hex', 'square', 'triangle']).default('hex'),

  cellWidth: z.coerce.number().min(0.001).default(1),

  power: z.coerce.number().min(1).max(9).default(3),

  numberTimeSteps: z.coerce.number().int().min(1).max(10).default(1),

  numClasses: z.coerce.number().int().min(1).default(6),

  fromDate: z
    .string()
    .transform((s) => new Date(s))
    .refine((d) => !isNaN(d.getTime()), { message: 'fromDate is invalid' })
    .optional()
    .prefault(() =>
      new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    ),

  toDate: z
    .string()
    .transform((s) => new Date(s))
    .refine((d) => !isNaN(d.getTime()), { message: 'toDate is invalid' })
    .optional()
    .prefault(() => new Date().toISOString()),
})

export type IdwQueryParams = z.infer<typeof IdwQuerySchema>

export async function parseIdwQuery(
  request: Request,
): Promise<IdwQueryParams> {
  const url = new URL(request.url)
  const params = Object.fromEntries(url.searchParams)

  const parseResult = IdwQuerySchema.safeParse(params)

  if (!parseResult.success) {
    const firstError = parseResult.error.issues[0]
    const message = firstError.message || 'Invalid query parameters'
    throw StandardResponse.badRequest(message)
  }

  const data = parseResult.data

  // Zusätzliche Validierungen
  if (data.toDate > new Date()) {
    throw StandardResponse.badRequest(
      'Invalid time frame specified: toDate is in the future',
    )
  }
  if (data.fromDate >= data.toDate) {
    throw StandardResponse.badRequest('fromDate must be before toDate')
  }

  return data
}