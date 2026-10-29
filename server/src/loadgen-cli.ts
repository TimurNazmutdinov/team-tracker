import { writeFileSync } from 'node:fs';
import { generateLoadData, LOAD_DEFAULTS } from '../../src/domain/loadgen';

// npm run load:data [файл] [проектов] [задач] [спринтов] — нагрузочный набор данных в JSON.
// Загрузка в пустую базу: SEED_FILE=<файл> npm run db:seed (ADR-015).

const [file = 'load-data.json', projects, issues, sprints] = process.argv.slice(2);
const data = generateLoadData({
  projects: projects ? Number(projects) : LOAD_DEFAULTS.projects,
  issues: issues ? Number(issues) : LOAD_DEFAULTS.issues,
  sprints: sprints ? Number(sprints) : LOAD_DEFAULTS.sprints,
});
writeFileSync(file, JSON.stringify(data));
console.log(
  `${file}: проектов ${data.projects.length}, спринтов ${data.sprints.length}, задач ${data.issues.length}, записей истории ${data.history.length}`,
);
