import Foundation

/*
 * The one piece of JavaScript arithmetic that is not plain IEEE 754.
 *
 * `+ - * /`, `Math.floor`, `%` and `Math.sqrt` are correctly rounded in both
 * languages, so a Swift port of them lands on the same doubles. `Math.hypot`
 * is not specified to the last bit: V8 normalises by the largest argument and
 * sums with Kahan compensation, while libm's `hypot` takes a different route to
 * a value that can differ by an ulp. The physics clamps speed with it and the
 * hunter walks with it, so one ulp compounded over a few thousand steps is a
 * different game. This is V8's algorithm (src/builtins/math.tq), unrolled for
 * two arguments.
 */
@inline(__always)
func jsHypot(_ a: Double, _ b: Double) -> Double {
  let x = abs(a)
  let y = abs(b)
  let top = max(x, y)
  if top == .infinity { return .infinity }
  if a.isNaN || b.isNaN { return .nan }
  if top == 0 { return 0 }

  var sum = 0.0
  var compensation = 0.0

  let nx = x / top
  var summand = nx * nx - compensation
  var preliminary = sum + summand
  compensation = (preliminary - sum) - summand
  sum = preliminary

  let ny = y / top
  summand = ny * ny - compensation
  preliminary = sum + summand
  compensation = (preliminary - sum) - summand
  sum = preliminary

  return sum.squareRoot() * top
}

@inline(__always)
func cellOf(_ v: Double) -> Int { Int(v.rounded(.down)) }
