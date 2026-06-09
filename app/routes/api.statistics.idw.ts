import { type LoaderFunctionArgs } from 'react-router'
import area from '@turf/area'
import bboxPolygon from '@turf/bbox-polygon'
import { findMatchingSensors } from '~/db/models/sensor.server'
import { aggregateMeasurements } from '~/db/models/measurement.aggregate.server'
import { idw_compute } from '~/services/idw-service.server'
import { parseIdwQuery } from '~/lib/api-schemas/idw-query-schema'
import { StandardResponse } from '~/lib/responses'
import { type BoxesDataQueryParams } from '~/lib/api-schemas/boxes-data-query-schema'



export async function loader({request}: LoaderFunctionArgs) {
    const parameters = await parseIdwQuery(request)

    const square_km = area(bboxPolygon(parameters.bbox as [number, number, number, number])) / 1e6 
    if(square_km / parameters.cellWidth > 2500){
        return StandardResponse.unprocessableContent('Requested area is too large for the given cell width. Please reduce the area or increase the cell width.')
    }

    let result
    try {
        result = await findMatchingSensors({
        phenomenon: parameters.phenomenon,
        exposure: parameters.exposure,
        } as BoxesDataQueryParams)
    } catch (error) {
        if (error instanceof Response) return error
        throw error
    }
    const { sensorsMap: sensor_maps, sensorIds: sensor_ids } = result

    const rows = await aggregateMeasurements(sensor_ids, parameters.fromDate, parameters.toDate, parameters.numberTimeSteps)
    if(rows.length === 0){
        return StandardResponse.notFound('No measurements found for the given parameters.')
    }

    const data = await idw_compute({rows, sensor_maps, grid_type: parameters.gridType, grid_size: parameters.cellWidth, bbox: parameters.bbox as [number, number, number, number], cellWidth: parameters.cellWidth, power: parameters.power, numberTimeSteps: parameters.numberTimeSteps, fromDate: parameters.fromDate, toDate: parameters.toDate, numClass: parameters.numClasses})


    return Response.json({code : 'success',data})



}