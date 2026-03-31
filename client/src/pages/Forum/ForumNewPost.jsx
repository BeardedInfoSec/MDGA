import { useState, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import PageHero from '../../components/common/PageHero';
import { Button, Input, Textarea, Alert } from '../../components/ui';
import styles from './Forum.module.css';

export default function ForumNewPost() {
  useDocumentTitle('New Post | MDGA');
  const { slug } = useParams();
  const navigate = useNavigate();
  const { isLoggedIn, apiFetch } = useAuth();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const imageRef = useRef(null);

  const handleImageChange = () => {
    const file = imageRef.current?.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!title.trim() || !content.trim()) {
      setError('Title and content are required.');
      return;
    }

    if (!slug) {
      setError('No category specified.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // Upload image if selected
      let imageUrl = null;
      const imageFile = imageRef.current?.files[0];
      if (imageFile) {
        const formData = new FormData();
        formData.append('image', imageFile);
        const uploadRes = await apiFetch('/upload', {
          method: 'POST',
          headers: {},
          body: formData,
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          imageUrl = uploadData.imageUrl;
        } else {
          const uploadErr = await uploadRes.json();
          throw new Error(uploadErr.error || 'Image upload failed');
        }
      }

      const res = await apiFetch('/forum/posts', {
        method: 'POST',
        body: JSON.stringify({
          categoryId: parseInt(slug),
          title: title.trim(),
          content: content.trim(),
          imageUrl,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        navigate(`/forum/post/${data.id}`);
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create post');
      }
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <>
        <PageHero title="New Post" subtitle="" />
        <section className="section">
          <div className="container">
            <p className={styles.empty}>
              <Link to="/login" className="m-link">Log in</Link> to create a post.
            </p>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHero title="New Post" subtitle="Start a discussion" />
      <section className="section">
        <div className="container">
          <Link to={`/forum/category/${slug}`} className={styles.backLink}>
            &larr; Back to Category
          </Link>

          <form className={styles.newPostForm} onSubmit={handleSubmit}>
            <label htmlFor="post-title">Title</label>
            <Input
              id="post-title"
              type="text"
              placeholder="Post title"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />

            <label htmlFor="post-content">Content</label>
            <Textarea
              id="post-content"
              placeholder="Write your post..."
              value={content}
              onChange={e => setContent(e.target.value)}
            />

            <div className={styles.uploadGroup}>
              <label htmlFor="post-image" className={styles.uploadLabel}>
                Attach image (optional)
              </label>
              <Input
                id="post-image"
                type="file"
                ref={imageRef}
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleImageChange}
                className={styles.uploadInput}
              />
              {imagePreview && (
                <img src={imagePreview} alt="Preview" className={styles.imagePreview} />
              )}
            </div>

            {error && (
              <Alert tone="error" className={styles.formError}>
                {error}
              </Alert>
            )}

            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? 'Posting...' : 'Create Post'}
            </Button>
          </form>
        </div>
      </section>
    </>
  );
}
