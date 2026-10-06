import { displayBrandColor } from "@/lib/brand-color";
import { Link } from "react-router-dom";
import { Clock, Eye } from "lucide-react";
import type { BlogPostWithRelations } from "@/lib/blog/types";
import { formatDateFr } from "@/lib/blog/utils";

type Props = { post: BlogPostWithRelations; variant?: "default" | "featured" | "compact" };

export default function PostCard({ post, variant = "default" }: Props) {
  const cat = post.blog_categories;
  const isFeatured = variant === "featured";

  return (
    <Link
      to={`/blog/${post.slug}`}
      className={`group block bg-card rounded-2xl overflow-hidden border border-border hover:shadow-lg transition-shadow ${
        isFeatured ? "md:col-span-2 md:row-span-2" : ""
      }`}
    >
      <div className={`relative overflow-hidden bg-muted ${isFeatured ? "aspect-[16/9]" : "aspect-[16/10]"}`}>
        {post.cover_image_url ? (
          <img
            src={post.cover_image_url}
            alt={post.cover_image_alt || post.title}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-foreground/80 to-foreground/40" />
        )}
        {cat && (
          <span
            className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider font-display font-bold text-white shadow"
            style={{ backgroundColor: displayBrandColor(cat.color) }}
          >
            {cat.name}
          </span>
        )}
      </div>
      <div className="p-5">
        <h3
          className={`font-display font-extrabold text-foreground leading-snug ${
            isFeatured ? "text-2xl md:text-3xl" : "text-lg"
          } line-clamp-2 group-hover:text-primary transition-colors`}
        >
          {post.title}
        </h3>
        {post.excerpt && (
          <p className="mt-2 text-sm text-muted-foreground font-body line-clamp-2">{post.excerpt}</p>
        )}
        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground font-body">
          <span>{formatDateFr(post.published_at)}</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {post.reading_time_minutes} min
          </span>
          {post.view_count > 0 && (
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" /> {post.view_count}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}