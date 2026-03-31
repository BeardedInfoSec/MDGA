import styles from './PageHero.module.css';

export default function PageHero({ title, subtitle }) {
  return (
    <section className={styles.hero}>
      <h1 className="text-shimmer">{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </section>
  );
}
