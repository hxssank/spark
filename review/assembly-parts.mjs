export function indexAssemblyParts(model) {
  const assembly = model.getObjectByName('Spark_A_fit_prototype');
  if (!assembly) throw new Error('The Spark assembly root is missing from the model.');
  const parts = new Map(assembly.children.map(part => [part.name, part]));
  return {
    parts,
    ownerName(object) {
      let candidate = object;
      while (candidate) {
        if (parts.get(candidate.name) === candidate) return candidate.name;
        candidate = candidate.parent;
      }
      return object.name;
    },
  };
}
