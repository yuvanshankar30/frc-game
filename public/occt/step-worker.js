// Classic worker: converts STEP / IGES / BREP files to triangle meshes with OpenCascade.
importScripts('occt-import-js.js');

let occtPromise = null;

onmessage = async (ev) => {
  const { id, format, buffer } = ev.data;
  try {
    occtPromise ??= occtimportjs({ locateFile: (p) => p });
    const occt = await occtPromise;
    const result = occt.ReadFile(format, new Uint8Array(buffer), {
      linearUnit: 'meter',
      linearDeflectionType: 'bounding_box_ratio',
      linearDeflection: 0.002,
      angularDeflection: 0.5,
    });
    postMessage({ id, result });
  } catch (err) {
    postMessage({ id, error: String(err) });
  }
};
