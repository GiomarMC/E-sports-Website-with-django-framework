import { describe, expect, it } from 'vitest'
import { parseErrorBody } from '../api'

describe('parseErrorBody', () => {
  it('reads DRF field errors', () => {
    const error = parseErrorBody(400, { team_name: ['Ya existe.'], members: ['Faltan jugadores.'] })
    expect(error.fields.team_name).toBe('Ya existe.')
    expect(error.message).toContain('Ya existe.')
  })

  it('prefers detail / non_field_errors as the message', () => {
    expect(parseErrorBody(400, { detail: ['Inscripciones cerradas.'] }).message).toBe('Inscripciones cerradas.')
    expect(parseErrorBody(400, { non_field_errors: ['X'] }).message).toBe('X')
    expect(parseErrorBody(400, { error: 'Contraseña incorrecta.' }).message).toBe('Contraseña incorrecta.')
  })

  it('flattens nested errors', () => {
    const error = parseErrorBody(400, { members: { 0: { student_code: ['Requerido'] } } })
    expect(error.fields.members).toBe('Requerido')
  })

  it('handles empty bodies', () => {
    expect(parseErrorBody(500, null).message).toContain('servidor')
  })
})
