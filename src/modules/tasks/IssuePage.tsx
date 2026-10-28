import { useParams } from 'react-router';
import { useIssue } from '../../state/queries';
import { Async } from '../../ui/Async';
import { NotFound } from '../../ui/NotFound';
import { PageHeader } from '../../ui/PageHeader';
import { StageNote } from '../../ui/StageNote';
import { useCurrentProject } from '../projects/ProjectRoute';

/** Карточка задачи: /projects/:key/issues/:number. */
export function IssuePage() {
  const project = useCurrentProject();
  const { number = '' } = useParams();
  const n = /^\d+$/.test(number) ? Number(number) : 0;
  const issue = useIssue(project.id, n);
  return (
    <Async query={issue}>
      {(found) =>
        found ? (
          <>
            <PageHeader title={`${project.key}-${found.number} ${found.title}`} />
            <p>
              {found.type} · {found.status} · приоритет {found.priority}
            </p>
            <StageNote stage={4} what="описание, подзадачи, связи, комментарии и история" />
          </>
        ) : (
          <NotFound what="Задача" />
        )
      }
    </Async>
  );
}
