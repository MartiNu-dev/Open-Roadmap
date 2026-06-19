"""Seed initial users, roadmaps, blocks and sample progress."""
import os
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from auth import hash_password
from models import User, Roadmap, RoadmapBlock, BlockResource, UserProgress, RoadmapLink


ROADMAPS = [
    {
        "slug": "frontend",
        "title": "Frontend Developer",
        "description": "A step-by-step guide to becoming a modern frontend developer in 2026.",
        "cover_emoji": "🎨",
        "blocks": [
            ("Internet Fundamentals", "How the web works", "Learn how HTTP, DNS, browsers and hosting work together to deliver web pages.", "beginner", "3h"),
            ("HTML Essentials", "Semantic markup", "Master semantic HTML: structure, forms, accessibility roles and SEO basics.", "beginner", "6h"),
            ("CSS Foundations", "Styling the web", "Box model, selectors, specificity, Flexbox and Grid layout systems.", "beginner", "10h"),
            ("Modern CSS", "Responsive & advanced", "Container queries, custom properties, animations and design tokens.", "intermediate", "8h"),
            ("JavaScript Core", "The language of the web", "Variables, scope, closures, async/await, modules and the DOM API.", "beginner", "20h"),
            ("Version Control with Git", "Track your work", "Branches, merges, rebasing, pull requests and team workflows.", "beginner", "4h"),
            ("Package Managers", "npm, yarn, pnpm", "Dependency management, semantic versioning and lockfiles.", "intermediate", "2h"),
            ("React Fundamentals", "Component-based UI", "Components, props, state, hooks, lifting state and composition.", "intermediate", "15h"),
            ("State Management", "Beyond useState", "Context, reducers, React Query and Zustand for client/server state.", "intermediate", "8h"),
            ("Testing & Quality", "Ship with confidence", "Jest, React Testing Library, Playwright and CI integration.", "advanced", "10h"),
            ("Performance & Deployment", "Production ready", "Bundling, code-splitting, lighthouse, Vercel/Netlify deployment.", "advanced", "6h"),
        ],
    },
    {
        "slug": "backend",
        "title": "Backend Developer",
        "description": "Master server-side development, APIs, databases and distributed systems.",
        "cover_emoji": "⚙️",
        "blocks": [
            ("Choose a Language", "Python, Node, Go...", "Compare ecosystems and pick a primary backend language.", "beginner", "2h"),
            ("OS & Terminal Basics", "Linux fluency", "Shell, processes, permissions and package management.", "beginner", "5h"),
            ("Version Control with Git", "Track your work", "Branches, merges, rebasing and pull request workflows.", "beginner", "4h"),
            ("Relational Databases", "SQL fundamentals", "Tables, joins, indexes, transactions and normalization.", "intermediate", "12h"),
            ("NoSQL Databases", "When to denormalize", "Document, key-value and column stores. CAP theorem trade-offs.", "intermediate", "6h"),
            ("REST API Design", "HTTP done right", "Resources, verbs, status codes, pagination and versioning.", "intermediate", "8h"),
            ("Authentication & Security", "JWT, OAuth, hashing", "Sessions, tokens, password hashing and OWASP top 10.", "intermediate", "10h"),
            ("Caching Strategies", "Redis & CDN", "Cache invalidation, TTLs, write-through vs write-behind.", "advanced", "5h"),
            ("Message Queues", "Async at scale", "Kafka, RabbitMQ, SQS and event-driven architecture.", "advanced", "8h"),
            ("Containers & Orchestration", "Docker + Kubernetes", "Images, networks, volumes, deployments and ingress.", "advanced", "12h"),
            ("Observability", "Logs, metrics, traces", "Prometheus, Grafana, OpenTelemetry and incident response.", "advanced", "6h"),
        ],
    },
    {
        "slug": "devops",
        "title": "DevOps & Cloud",
        "description": "Bridge development and operations with automation, infrastructure-as-code and reliable delivery.",
        "cover_emoji": "🚀",
        "blocks": [
            ("Linux Fundamentals", "Your daily driver", "File system, processes, systemd, networking and shell scripting.", "beginner", "8h"),
            ("Networking Basics", "TCP/IP, DNS, TLS", "OSI model, routing, load balancing and the TLS handshake.", "beginner", "6h"),
            ("Version Control with Git", "Track everything", "Workflows, hooks and trunk-based development.", "beginner", "4h"),
            ("CI/CD Pipelines", "Automate delivery", "GitHub Actions, GitLab CI, build/test/deploy pipelines.", "intermediate", "8h"),
            ("Docker", "Package once, run anywhere", "Images, layers, networks, volumes and Dockerfile best practices.", "intermediate", "6h"),
            ("Kubernetes", "Container orchestration", "Pods, deployments, services, ingress, helm and operators.", "advanced", "15h"),
            ("Infrastructure as Code", "Terraform & Pulumi", "Declarative infra, state files, modules and drift detection.", "advanced", "10h"),
            ("Cloud Providers", "AWS / GCP / Azure", "Compute, storage, networking and managed services overview.", "intermediate", "12h"),
            ("Monitoring & Alerting", "Stay ahead of issues", "Prometheus, Grafana, PagerDuty, SLOs and error budgets.", "advanced", "6h"),
            ("Secrets & Security", "Secure by default", "Vault, KMS, IAM least-privilege and supply-chain security.", "advanced", "5h"),
            ("Site Reliability Engineering", "Production excellence", "Postmortems, chaos engineering, capacity planning.", "advanced", "8h"),
        ],
    },
]


def _zigzag_position(idx: int) -> tuple[int, int, str]:
    """Place blocks alternately left/center/right with vertical spacing."""
    column = idx % 3  # 0 left, 1 center, 2 right
    row = idx // 3
    x_by_col = {0: 80, 1: 360, 2: 640}
    style = "primary" if column == 1 else "alternative"
    return x_by_col[column], 80 + row * 160, style


def _backfill_layout(db: Session) -> None:
    """Set positions/styles + sequential links for blocks/roadmaps that lack them."""
    roadmaps = db.query(Roadmap).all()
    for rm in roadmaps:
        blocks = sorted(rm.blocks, key=lambda b: b.order_index)
        needs_layout = any(b.x == 0 and b.y == 0 for b in blocks)
        if needs_layout:
            for i, b in enumerate(blocks):
                x, y, style = _zigzag_position(i)
                b.x, b.y, b.width, b.height = x, y, 220, 64
                if not b.node_style or b.node_style == "primary":
                    b.node_style = style if i > 0 else "primary"
        existing_links = db.query(RoadmapLink).filter(RoadmapLink.roadmap_id == rm.id).count()
        if existing_links == 0 and len(blocks) > 1:
            for a, c in zip(blocks, blocks[1:]):
                db.add(RoadmapLink(
                    roadmap_id=rm.id, from_block_id=a.id, to_block_id=c.id, style="solid",
                ))
    db.flush()


def _ensure_user(db: Session, email: str, password: str, name: str, role: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        user = User(email=email, name=name, password_hash=hash_password(password), role=role)
        db.add(user)
        db.flush()
    return user


def seed_all(db: Session) -> None:
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    user_email = os.environ.get("SEED_USER_EMAIL", "user@example.com")
    user_password = os.environ.get("SEED_USER_PASSWORD", "user123")
    editor_email = os.environ.get("SEED_EDITOR_EMAIL", "editor@example.com")
    editor_password = os.environ.get("SEED_EDITOR_PASSWORD", "editor123")

    admin = _ensure_user(db, admin_email, admin_password, "Admin", "admin")
    editor = _ensure_user(db, editor_email, editor_password, "Editor", "editor")
    user = _ensure_user(db, user_email, user_password, "Standard User", "user")
    _ = (admin, editor)

    if db.query(Roadmap).count() == 0:
        for rm in ROADMAPS:
            roadmap = Roadmap(
                slug=rm["slug"],
                title=rm["title"],
                description=rm["description"],
                cover_emoji=rm["cover_emoji"],
                status="published",
            )
            db.add(roadmap)
            db.flush()
            for idx, (title, short, detail, level, duration) in enumerate(rm["blocks"]):
                block = RoadmapBlock(
                    roadmap_id=roadmap.id,
                    title=title,
                    short_description=short,
                    detailed_content=detail,
                    level=level,
                    estimated_duration=duration,
                    order_index=idx,
                )
                db.add(block)
                db.flush()
                db.add(BlockResource(
                    block_id=block.id, label=f"{title} — official guide",
                    url=f"https://example.com/{rm['slug']}/{idx}", kind="article", order_index=0,
                ))
                db.add(BlockResource(
                    block_id=block.id, label=f"{title} — video walkthrough",
                    url=f"https://youtube.com/watch?v={rm['slug']}-{idx}", kind="video", order_index=1,
                ))

        db.flush()

        # Sample progress for standard user on first roadmap
        first_roadmap = db.query(Roadmap).filter(Roadmap.slug == "frontend").first()
        if first_roadmap:
            blocks = db.query(RoadmapBlock).filter(RoadmapBlock.roadmap_id == first_roadmap.id).order_by(RoadmapBlock.order_index).all()
            now = datetime.now(timezone.utc)
            for i, b in enumerate(blocks[:4]):
                if i < 3:
                    db.add(UserProgress(
                        user_id=user.id, roadmap_id=first_roadmap.id, block_id=b.id,
                        status="completed", started_at=now, completed_at=now,
                    ))
                else:
                    db.add(UserProgress(
                        user_id=user.id, roadmap_id=first_roadmap.id, block_id=b.id,
                        status="in_progress", started_at=now,
                    ))

    _backfill_layout(db)
    db.commit()
