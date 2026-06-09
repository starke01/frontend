import { pg } from '~/db.server'

export type AggregatedBucket = {
  sensor_id: string, bucket: number, avg: number
}

export async function aggregateMeasurements(sensorIds: string[], fromDate: Date, toDate: Date, numTimeSteps: number): Promise<AggregatedBucket[]> {
    const perRows = await pg.unsafe(
    `SELECT measure.sensor_id,
            width_bucket(
              extract(epoch from measure.time),
              extract(epoch from $2::timestamptz),
              extract(epoch from $3::timestamptz),
              $4::int
            ) AS bucket,
            avg(measure.value) AS avg
     FROM measurement measure
     WHERE measure.sensor_id = ANY($1::text[])
       AND measure.time >= $2 AND measure.time < $3
     GROUP BY measure.sensor_id, bucket
     ORDER BY bucket, measure.sensor_id`, 
     [sensorIds, fromDate.toISOString(), toDate.toISOString(), numTimeSteps],
    )
  return perRows as unknown as AggregatedBucket[]
}

