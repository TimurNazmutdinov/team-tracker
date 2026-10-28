# Модель данных

## Сущности

- **Project** — проект; `key` (например, `DEMO`) формирует номера задач вида `DEMO-12`.
- **Person** — участник команды с ролью.
- **Sprint** — спринт проекта с целью, датами и состоянием `planned | active | closed`.
- **Issue** — задача любого типа (Epic, Story, Task, Bug, Sub-task); `parentId` задаёт иерархию, `sprintId = null` означает бэклог, `order` — ручной порядок.
- **Link** — связь между двумя задачами: `blocks | relates | duplicates`.
- **Comment** — комментарий к задаче.
- **History** — запись об изменении поля задачи (кто, что, было → стало, когда).

Итоги по людям и спринтам не хранятся — считаются из задач и истории. Бакеты доски — это группировка по полю, отдельной сущности для них нет.

## Поля

| Сущность | Поля |
|----------|------|
| Project | id, key, name |
| Person | id, name, role |
| Sprint | id, projectId, name, goal, start, end, state (planned\|active\|closed) |
| Issue | id, projectId, number, type, title, description, acceptance, status, priority (Highest\|High\|Medium\|Low), points, assigneeId, reporterId, parentId, sprintId, labels[], order, dueDate, createdAt, updatedAt |
| Link | id, fromId, toId, type (blocks\|relates\|duplicates) |
| Comment | id, issueId, authorId, text, createdAt |
| History | id, issueId, authorId, field, from, to, at |

## ER-диаграмма

```mermaid
erDiagram
    Project ||--o{ Sprint : has
    Project ||--o{ Issue : has
    Sprint |o--o{ Issue : contains
    Person |o--o{ Issue : "assigned to"
    Person ||--o{ Issue : reports
    Issue |o--o{ Issue : "parent of"
    Issue ||--o{ Link : "from"
    Issue ||--o{ Link : "to"
    Issue ||--o{ Comment : has
    Issue ||--o{ History : has
    Person ||--o{ Comment : writes
    Person ||--o{ History : makes

    Project {
        string id
        string key
        string name
    }
    Person {
        string id
        string name
        string role
    }
    Sprint {
        string id
        string projectId
        string name
        string goal
        date start
        date end
        string state "planned|active|closed"
    }
    Issue {
        string id
        string projectId
        int number
        string type
        string title
        string description
        string acceptance
        string status
        string priority "Highest|High|Medium|Low"
        int points
        string assigneeId
        string reporterId
        string parentId
        string sprintId
        string[] labels
        int order
        date dueDate
        datetime createdAt
        datetime updatedAt
    }
    Link {
        string id
        string fromId
        string toId
        string type "blocks|relates|duplicates"
    }
    Comment {
        string id
        string issueId
        string authorId
        string text
        datetime createdAt
    }
    History {
        string id
        string issueId
        string authorId
        string field
        string from
        string to
        datetime at
    }
```
