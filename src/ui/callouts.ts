import type { BeatId, PartId } from '../content/copy'

export interface CalloutItem {
  anchor: PartId | 'hub'
  index: string
  name: string
  detail?: string
  /** Detail text written live by the render loop under this key. */
  live?: string
}

export interface CalloutSet {
  id: string
  beat: BeatId
  items: CalloutItem[]
}

/** Callout sets, one per chapter that labels the model. */
export const CALLOUT_SETS: CalloutSet[] = [
  {
    id: 'engineering',
    beat: 'engineering',
    items: [
      { anchor: 'knob', index: '01', name: 'Walnut knob', detail: 'Spins freely on a steel spindle' },
      { anchor: 'dial', index: '02', name: 'Adjustment dial', detail: '30 steps per turn, 20 µm each' },
      { anchor: 'bearing', index: '03', name: 'Sealed bearings', detail: 'Burr held true to 0.02 mm' },
      { anchor: 'burr', index: '04', name: 'Conical burr', detail: '48 mm hardened steel, TiN-coated' },
    ],
  },
  {
    id: 'xray',
    beat: 'xray',
    items: [
      { anchor: 'hub', index: '01', name: 'Crank', detail: 'You turn it' },
      { anchor: 'shaft', index: '02', name: 'Hex shaft', detail: 'Carries every degree, 1 : 1' },
      { anchor: 'burr', index: '03', name: 'Burr', detail: 'Cuts against a fixed ring' },
    ],
  },
  {
    id: 'grind',
    beat: 'grind',
    items: [{ anchor: 'burr', index: '', name: 'Burr gap', live: 'c-gap' }],
  },
]
