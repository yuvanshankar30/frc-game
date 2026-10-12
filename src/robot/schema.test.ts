import { describe, it, expect } from 'vitest';
import { parseRobot, checkRules } from './schema';
import { sortJoints } from './assemble';
import { BUILTINS } from '../robots/registry';
import { buildBuiltin } from '../robots/registry';

describe('robot schema', () => {
  it('fills defaults for a minimal definition', () => {
    const d = parseRobot({ id: 'x', name: 'X', frame: { length: 0.7, width: 0.7, height: 0.5 }, drivetrain: { type: 'tank' }, storage: {} });
    expect(d.schemaVersion).toBe(1);
    expect(d.storage.capacity).toBe(30);
    expect(d.intake).toBeNull();
    expect(d.model.scale).toBe(1);
  });
  it('flags oversize robots per the 2026 rules', () => {
    const d = parseRobot({ id: 'x', name: 'X', frame: { length: 1, width: 0.6, height: 0.9 }, drivetrain: { type: 'swerve' }, storage: {} });
    const msgs = checkRules(d).map((i) => i.message).join(' ');
    expect(msgs).toMatch(/perimeter/);
    expect(msgs).toMatch(/30in/);
  });
  it('detects bad joint references', () => {
    const d = parseRobot({
      id: 'x', name: 'X', frame: { length: 0.7, width: 0.7, height: 0.5 }, drivetrain: { type: 'swerve' }, storage: {},
      joints: [{ id: 'a', type: 'revolute', parent: 'nope' }],
      parts: [{ node: 'n', joint: 'missing' }],
    });
    expect(checkRules(d).filter((i) => i.level === 'error')).toHaveLength(2);
  });
  it('sorts joints parents-first', () => {
    const d = parseRobot({
      id: 'x', name: 'X', frame: { length: 0.7, width: 0.7, height: 0.5 }, drivetrain: { type: 'swerve' }, storage: {},
      joints: [{ id: 'hood', type: 'revolute', parent: 'turret' }, { id: 'turret', type: 'revolute' }],
    });
    expect(sortJoints(d.joints).map((j) => j.id)).toEqual(['turret', 'hood']);
  });
});

describe('built-in robots', () => {
  it('there are six, each valid and within the 2026 frame rules', () => {
    expect(BUILTINS).toHaveLength(6);
    for (const b of BUILTINS) {
      const { def } = buildBuiltin(b);
      const errors = checkRules(def);
      expect(errors, `${def.name}: ${errors.map((e) => e.message).join(', ')}`).toHaveLength(0);
      expect(def.frame.height).toBeLessThanOrEqual(0.5652); // fits under the TRENCH
      expect(def.sources.length).toBeGreaterThan(0);
    }
  });
});
