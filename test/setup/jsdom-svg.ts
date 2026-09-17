/**
 * jsdom implements no SVG layout, so `getBBox` and friends are missing and
 * frappe-gantt calls them while positioning labels. Stub the few it needs;
 * geometry is not what these tests assert.
 */
interface SvgLayoutStubs {
  getBBox?: () => DOMRect
  getComputedTextLength?: () => number
}

const proto = globalThis.SVGElement?.prototype as (SVGElement & SvgLayoutStubs) | undefined

if (proto && !proto.getBBox) {
  proto.getBBox = () =>
    ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON: () => ({}),
    }) as DOMRect
}

if (proto && !proto.getComputedTextLength) {
  proto.getComputedTextLength = () => 0
}
