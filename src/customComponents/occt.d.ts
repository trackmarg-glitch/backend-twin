/** Minimal types for occt-import-js (OpenCascade compiled to WebAssembly). */
declare module 'occt-import-js' {
  interface OcctMesh {
    name: string;
    attributes: { position: { array: ArrayLike<number> } };
    index?: { array: ArrayLike<number> };
    brep_faces?: unknown[];
  }
  export interface OcctResult {
    success: boolean;
    meshes: OcctMesh[];
  }
  interface OcctParams {
    linearUnit?: 'millimeter' | 'centimeter' | 'meter' | 'inch' | 'foot';
    linearDeflectionType?: 'bounding_box_ratio' | 'absolute_value';
    linearDeflection?: number;
    angularDeflection?: number;
  }
  export interface Occt {
    ReadStepFile(content: Uint8Array, params: OcctParams | null): OcctResult;
    ReadIgesFile(content: Uint8Array, params: OcctParams | null): OcctResult;
    ReadBrepFile(content: Uint8Array, params: OcctParams | null): OcctResult;
  }
  const init: (opts?: { locateFile?: (name: string) => string }) => Promise<Occt>;
  export default init;
}
