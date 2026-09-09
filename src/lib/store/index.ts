/**
 * ストアの入口。ここを import すると全ストアが登録され、
 * exportAll / importAll が全部を対象にできる。
 */
export {
  createStore,
  exportAll,
  importAll,
  newId,
  resetAll,
  storeNames,
  EXPORT_VERSION,
  KEY_PREFIX,
  type ExportEnvelope,
  type ImportResult,
  type Store,
} from "./createStore";
export {
  CompetitorSchema,
  ProjectSchema,
  ProjectsSchema,
  projectsStore,
  currentProjectIdStore,
  addProject,
  updateProject,
  removeProject,
  buildProject,
  normalizeDomain,
  splitList,
  resolveCurrentProject,
  type Competitor,
  type Project,
  type ProjectInput,
} from "./projects";
export {
  MapsSelectionSchema,
  PlaceRefSchema,
  EMPTY_MAPS_SELECTION,
  mapsSelectionStore,
  selectOwn,
  toggleCompetitor,
  type MapsSelection,
  type PlaceRef,
} from "./maps";
