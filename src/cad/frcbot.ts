import JSZip from 'jszip';
import { parseRobot, type RobotDefinition } from '../robot/schema';

/**
 * .frcbot package: a zip with
 *   robot.json   — RobotDefinition (schemaVersion 1)
 *   model.glb    — the robot model; node names are referenced by robot.json parts
 *   README.txt   — human readable note
 */
export async function packFrcbot(def: RobotDefinition, glb: ArrayBuffer): Promise<Blob> {
  const zip = new JSZip();
  zip.file('robot.json', JSON.stringify({ ...def, source: 'package' }, null, 2));
  zip.file('model.glb', glb);
  zip.file(
    'README.txt',
    `${def.team ? def.team + ' ' : ''}${def.name}\nFRC Sim robot package (.frcbot)\nrobot.json: robot definition (frame, drivetrain, mechanisms, joints)\nmodel.glb: model (meters, +X forward, +Y up after the transform in robot.json "model")\n`,
  );
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export async function unpackFrcbot(data: ArrayBuffer | Blob): Promise<{ def: RobotDefinition; glb: ArrayBuffer }> {
  const zip = await JSZip.loadAsync(data);
  const json = zip.file('robot.json');
  const model = zip.file('model.glb');
  if (!json || !model) throw new Error('Not a valid .frcbot: missing robot.json or model.glb');
  const def = parseRobot(JSON.parse(await json.async('string')));
  const glb = await model.async('arraybuffer');
  return { def: { ...def, source: 'package' }, glb };
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
