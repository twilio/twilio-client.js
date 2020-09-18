'use strict';

var rfactorConstants = {
  r0: 94.768,
  is: 1.42611
};

/**
 * Calculate the mos score of a stats object
 * @param {number} rtt
 * @param {number} jitter
 * @param {number} fractionLost - The fraction of packets that have been lost
     Calculated by packetsLost / totalPackets
 * @return {number} mos - Calculated MOS, 1.0 through roughly 4.5
 */
function calcMos(rtt, jitter, fractionLost) {
  if (!isPositiveNumber(rtt) || !isPositiveNumber(jitter) || !isPositiveNumber(fractionLost)) {
    return null;
  }

  var rFactor = calculateRFactor(rtt, jitter, fractionLost);

  var mos = 1 + 0.035 * rFactor + 0.000007 * rFactor * (rFactor - 60) * (100 - rFactor);

  // Make sure MOS is in range
  var isValid = mos >= 1.0 && mos < 4.6;
  return isValid ? mos : null;
}

function calculateRFactor(rtt, jitter, fractionLost) {
  var effectiveLatency = rtt + jitter * 2 + 10;
  var rFactor = 0;

  switch (true) {
    case effectiveLatency < 160:
      rFactor = rfactorConstants.r0 - effectiveLatency / 40;
      break;
    case effectiveLatency < 1000:
      rFactor = rfactorConstants.r0 - (effectiveLatency - 120) / 10;
      break;
    case effectiveLatency >= 1000:
      rFactor = rfactorConstants.r0 - effectiveLatency / 100;
      break;
  }

  var multiplier = .01;
  switch (true) {
    case fractionLost === -1:
      multiplier = 0;
      rFactor = 0;
      break;
    case fractionLost <= rFactor / 2.5:
      multiplier = 2.5;
      break;
    case fractionLost > rFactor / 2.5 && fractionLost < 100:
      multiplier = .25;
      break;
  }

  rFactor -= fractionLost * multiplier;
  return rFactor;
}

function isPositiveNumber(n) {
  return typeof n === 'number' && !isNaN(n) && isFinite(n) && n >= 0;
}

module.exports = {
  calculate: calcMos
};