import { type FeatureCollection, type Polygon } from 'geojson'
import { point } from '@turf/helpers'
import centroid from '@turf/centroid'
import distance from '@turf/distance'
import hexGrid from '@turf/hex-grid'
import squareGrid from '@turf/square-grid'
import triangleGrid from '@turf/triangle-grid'
import { type AggregatedBucket } from '~/db/models/measurement.aggregate.server'
import { quantile } from 'simple-statistics'

const grid_definition = {
    hex: hexGrid,
    square: squareGrid,
    triangle: triangleGrid
}

type Sensor_meta_data = {
  lat: number
  lon: number
}

type Options_sensors = {
    rows: AggregatedBucket[],
    sensor_maps: Record<string, Sensor_meta_data>,
    grid_type: 'hex' | 'square' | 'triangle',
    grid_size: number,
    bbox: [number, number, number, number], 
    cellWidth: number,
    power: number, 
    numberTimeSteps: number, 
    numClass: number, 
    fromDate: Date,
    toDate: Date

}



export function idw_compute(options: Options_sensors) {

    const compute_grid = grid_definition[options.grid_type](options.bbox, options.cellWidth, { units: 'kilometers' })

    const grid_centers = compute_grid.features.map((feature) => centroid(feature))
    for (const c of compute_grid.features) {
        ;(c.properties as any).idwValues = []
    }

    const byBucket = new Map<number, AggregatedBucket[]>()
    for(const row of options.rows) {
        const list = byBucket.get(row.bucket) || []
        list.push(row)
        byBucket.set(row.bucket, list)

    }

    let min_break = Number.POSITIVE_INFINITY
    let max_break = Number.NEGATIVE_INFINITY
    const all_values: number[] = []





    //Zeitschritte Mittelpunkt

    const diff_mean_time = (options.toDate.getTime() - options.fromDate.getTime()) / options.numberTimeSteps
    const time_steps: string[] = []

    //pro Zeitschritt den IDW berechnen

    for(let i = 0; i < options.numberTimeSteps; i++) {
        const buck_index = i + 1
        const rows = byBucket.get(buck_index) ?? []
        

        const control_points = []
        for(const row of rows) {
            const meta = options.sensor_maps[row.sensor_id]
                if(!meta) continue
                const value = Number(row.avg)
                if(isNaN(value)) continue
                if(value < min_break) min_break = value
                if(value > max_break) max_break = value
                all_values.push(value)
                control_points.push(point([meta.lon, meta.lat], { value }))

        }

        // IDW für alle Zeilen berechnen
        for(let j = 0; j< grid_centers.length; j++) {
            let zaehler = 0
            let nenner = 0
            let exact = null as number | null
            for(const control_point of control_points) {
                const dist = distance(grid_centers[j],control_point, { units: 'kilometers' })
                if(dist === 0) {
                    exact = control_point.properties!.value
                    break
                }
                const w = 1 / Math.pow(dist, options.power)
                nenner = nenner + w
                zaehler = zaehler + w * control_point.properties!.value
            }

            const v = exact !== null ? exact : control_points.length > 0 ? zaehler / nenner : NaN
            ;(compute_grid.features[j].properties as any).idwValues.push(v)

        }

        time_steps.push(new Date(options.fromDate.getTime() + diff_mean_time * i+ diff_mean_time/2).toISOString())


    }


    const breaks = []
    if(all_values.length > 0) {
        for(let i = 0; i < options.numClass; i++) {
            breaks.push(quantile(all_values, i / (options.numClass - 1)))
        }
    }


    return{
        breaks, 
        feature_collection: compute_grid as FeatureCollection<Polygon, { idwValues: number[] }>,
        time_steps
    }
}


