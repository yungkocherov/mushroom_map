/**
 * FeedbackButton — floating «конверт» в правом нижнем углу страницы.
 *
 * Click → Radix Dialog с textarea + полем для контакта (опционально) +
 * submit. Тело уходит в POST /api/feedback и складывается в
 * `user_feedback` (миграция 041). Анонимам можно — auth-token
 * добавляется только если юзер залогинен.
 *
 * Размещение: глобально через Layout.tsx (не-map shell) и MapHomePage
 * (map shell) — на /map свой шелл без Layout-overlay'я.
 */

import * as Dialog from "@radix-ui/react-dialog";
import { Mail, Send, X, Check } from "lucide-react";
import { useState } from "react";

import { submitFeedback } from "@mushroom-map/api-client";
import { useAuth } from "../auth/useAuth";
import styles from "./FeedbackButton.module.css";

export interface FeedbackButtonProps {
  /**
   * 'default' (right:18, bottom:18) — обычные страницы.
   * 'aboveMapNav' — поднят над bottom-right NavigationControl карты,
   *   чтобы не пересекаться с zoom +/− кнопками.
   */
  placement?: "default" | "aboveMapNav";
}

export function FeedbackButton({
  placement = "default",
}: FeedbackButtonProps = {}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const auth = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 3) {
      setError("Слишком коротко — хотя бы пара слов.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const token = auth.getAccessToken?.() ?? undefined;
      await submitFeedback(
        {
          message: message.trim(),
          contact: contact.trim() || undefined,
          page_url: window.location.href,
        },
        token,
      );
      setDone(true);
      // Авто-закрытие через 1.6с — успех + сразу освобождаем экран.
      setTimeout(() => {
        setOpen(false);
        // Reset на следующий цикл — иначе пользователь видит cleared
        // form пока модалка ещё закрывается.
        setTimeout(() => {
          setDone(false);
          setMessage("");
          setContact("");
        }, 200);
      }, 1600);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не получилось — попробуй позже.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={`${styles.fab}${placement === "aboveMapNav" ? ` ${styles.fabAboveMap}` : ""}`}
          aria-label="Написать автору"
          title="Обратная связь"
        >
          <Mail size={18} aria-hidden="true" />
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content} aria-label="Обратная связь">
          <Dialog.Close asChild>
            <button
              type="button"
              className={styles.close}
              aria-label="Закрыть"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </Dialog.Close>

          <Dialog.Title asChild>
            <p className={styles.eyebrow}>Обратная связь</p>
          </Dialog.Title>
          <Dialog.Description asChild>
            <p className={styles.lead}>
              Нашёл баг или есть предложение? Напиши — это ник без формальностей,
              сразу попадает автору.
            </p>
          </Dialog.Description>

          {done ? (
            <div className={styles.success}>
              <Check size={20} aria-hidden="true" />
              <span>Спасибо! Прочитаю.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className={styles.form}>
              <label className={styles.field}>
                <span>Сообщение</span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  maxLength={4000}
                  required
                  minLength={3}
                  placeholder="Например: на /map не подгружается слой ООПТ при включении на спутнике"
                  autoFocus
                />
              </label>
              <label className={styles.field}>
                <span>
                  Контакт <em>· необязательно</em>
                </span>
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  maxLength={200}
                  placeholder="email или telegram, если хочешь ответ"
                />
              </label>

              {error && <p className={styles.error}>{error}</p>}

              <div className={styles.footer}>
                <button
                  type="submit"
                  className={styles.submit}
                  disabled={submitting || message.trim().length < 3}
                >
                  <Send size={14} aria-hidden="true" />
                  <span>{submitting ? "Отправляем…" : "Отправить"}</span>
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
