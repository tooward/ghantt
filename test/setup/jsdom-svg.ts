/*
 * Copyright 2026 Mike Ward
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
