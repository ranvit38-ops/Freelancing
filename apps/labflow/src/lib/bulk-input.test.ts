import { describe, expect, it } from 'vitest';
import { expandRange, isMultiEntry, parseConditionLines, parseEmails, parseSampleIdList, parseTaskLines } from './bulk-input';

describe('parseConditionLines', () => {
  it('reads rows copied from a spreadsheet, skipping the header', () => {
    expect(parseConditionLines('Condition\tValue\tUnit\nTemperature\t25\t°C\npH\t7.4\t\n')).toEqual([
      { name: 'Temperature', value: '25', unit: '°C' },
      { name: 'pH', value: '7.4', unit: '' },
    ]);
  });

  it('splits a two-column paste into value and unit', () => {
    expect(parseConditionLines('Time\t30 min')).toEqual([{ name: 'Time', value: '30', unit: 'min' }]);
  });

  it('reads typed lines in the usual shapes', () => {
    expect(parseConditionLines('Temperature: 25 °C\npH = 7.4\nStir speed 300 rpm\nBuffer: PBS\nShaken')).toEqual([
      { name: 'Temperature', value: '25', unit: '°C' },
      { name: 'pH', value: '7.4', unit: '' },
      { name: 'Stir speed', value: '300', unit: 'rpm' },
      { name: 'Buffer', value: 'PBS', unit: '' },
      { name: 'Shaken', value: '', unit: '' },
    ]);
  });

  it('keeps negative and scientific values whole', () => {
    expect(parseConditionLines('Freezer -80 °C\nDose 1.5e-3 mol')).toEqual([
      { name: 'Freezer', value: '-80', unit: '°C' },
      { name: 'Dose', value: '1.5e-3', unit: 'mol' },
    ]);
  });
});

describe('isMultiEntry', () => {
  it('spreads only pastes that hold more than one entry', () => {
    expect(isMultiEntry('25')).toBe(false);
    expect(isMultiEntry('a\nb')).toBe(true);
    expect(isMultiEntry('Temperature\t25')).toBe(true);
    expect(isMultiEntry('25\n')).toBe(false);
  });
});

describe('expandRange', () => {
  it('expands ranges and keeps zero padding', () => {
    expect(expandRange('S-101 to S-104')).toEqual(['S-101', 'S-102', 'S-103', 'S-104']);
    expect(expandRange('T008..T011')).toEqual(['T008', 'T009', 'T010', 'T011']);
    expect(expandRange('A1–A3')).toEqual(['A1', 'A2', 'A3']);
  });

  it('leaves anything that is not a range alone', () => {
    expect(expandRange('S-101')).toEqual(['S-101']);
    expect(expandRange('S-120 to S-101')).toEqual(['S-120 to S-101']);
    expect(expandRange('A1 to B3')).toEqual(['A1 to B3']);
    expect(expandRange('X1 to X99999')).toEqual(['X1 to X99999']);
  });
});

describe('parseSampleIdList', () => {
  it('reads lines, commas and ranges, once each', () => {
    expect(parseSampleIdList('S-101 to S-103\nS-200, S-201\ns-101\n\n')).toEqual(['S-101', 'S-102', 'S-103', 'S-200', 'S-201']);
  });

  it('takes the first column of a spreadsheet', () => {
    expect(parseSampleIdList('A-1\tsoil\nA-2\twater')).toEqual(['A-1', 'A-2']);
  });

  it('keeps IDs that contain spaces', () => {
    expect(parseSampleIdList('Batch 1\nBatch 2')).toEqual(['Batch 1', 'Batch 2']);
  });
});

describe('parseTaskLines', () => {
  it('reads meeting notes, dropping bullets, numbers and checkboxes', () => {
    expect(parseTaskLines('- Order pipette tips\n2. Re-run batch 3\n[ ] Book the TEM\n\n• Email Maya\nCalibrate 4 probes')).toEqual([
      'Order pipette tips',
      'Re-run batch 3',
      'Book the TEM',
      'Email Maya',
      'Calibrate 4 probes',
    ]);
  });
});

describe('parseEmails', () => {
  it('reads any common separator and mail-client format', () => {
    expect(parseEmails('a@uni.edu, B@Uni.edu; c@uni.edu\nMaya Chen <maya@uni.edu>\na@uni.edu')).toEqual([
      'a@uni.edu',
      'b@uni.edu',
      'c@uni.edu',
      'maya@uni.edu',
    ]);
  });
});
