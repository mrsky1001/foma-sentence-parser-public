# FOMA Sentence Parser

> **Интерактивный синтаксический анализатор английских предложений**  
> Visual English Sentence Syntax Tree & Analytical Parser

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live%20Demo-brightgreen)](https://mrsky1001.github.io/foma-sentence-parser-public/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Author: Nikita Kolyada](https://img.shields.io/badge/Author-Nikita%20Kolyada-cc6a47)](https://foma-creative.com)
[![Company: foma-creative.com](https://img.shields.io/badge/Company-foma--creative.com-101010)](https://foma-creative.com)

---

## 🌐 Онлайн-версия (Live Demo)

Веб-приложение доступно и готово к работе без установки:  
👉 **[https://mrsky1001.github.io/foma-sentence-parser-public/](https://mrsky1001.github.io/foma-sentence-parser-public/)**

---

## 💡 О проекте

**FOMA Sentence Parser** — это профессиональный инструмент для визуализации, интерактивного синтаксического разбора и грамматического анализа английских предложений. Разработан для студентов, преподавателей и лингвистов.

Приложение позволяет проводить полный многоуровневый разбор предложений любой сложности: от простых эллиптических конструкций до сложных полипредикативных предложений с несколькими типами придаточных.

### 5 аналитических слоев грамматического разбора

1. **Части речи (Parts of Speech — POS)**: существительные, местоимения, артикли, прилагательные, глаголы, предлоги, союзы, междометия.
2. **Члены предложения (Sentence Parts / Members)**: подлежащее (*Subject*), сказуемое (*Predicate*), именная часть (*Predicative*), дополнения (*Direct, Indirect, Prepositional Object*), определения (*Attribute*), обстоятельства (*Adverbial modifier: Time, Place, Manner, Cause, Purpose, Degree, Concession*), вводные слова (*Parenthesis*), обращения (*Address*).
3. **Типы придаточных предложений (Clauses)**: главное (*Main clause*), придаточные подлежащные (*Subject*), сказуемные (*Predicative*), дополнительные (*Object*), определительные (*Attributive*), обстоятельственные (*Adverbial*).
4. **Видовременные формы глаголов (Verb Tenses, Aspect, Voice)**: Indefinite / Continuous / Perfect / Perfect Continuous; Active / Passive Voice; модальные глаголы.
5. **Тип предложения и коммуникативная цель (Sentence Types — ST)**: Simple / Compound / Complex / Compound-Complex; Declarative / Interrogative / Imperative / Exclamatory; Affirmative / Negative.

---

## ⚡ Ключевые возможности

- **Интерактивный холст (HTML5 Canvas)**: плавное выделение слов мышью, визуальные скобки членов предложения, линии связи, цветовое кодирование по слоям.
- **Двойной режим работы**:
  - **«Мой разбор»**: самостоятельный интерактивный анализ с проверкой правил и подсказками.
  - **«Разбор ИИ»**: мгновенная генерация эталонного синтаксического дерева через языковые модели с возможностью сравнения и переноса на основной холст.
- **Поддержка AI-провайдеров**:
  - **Groq Cloud** (сверхбыстрый инференс: `gpt-oss-120b`, `qwen3.8-27b`, `llama-3.3-70b`).
  - **PositionAPI** (`gpt-4o`, `claude-3-5-sonnet`, `deepseek-chat`).
  - **Custom (OpenAI-compatible)**: поддержка локальных серверов Ollama (`http://localhost:11434/v1`), vLLM, LM Studio, OpenRouter.
- **Движок инвариантов Auto (100%)**: мгновенная автоматическая разметка однозначных грамматических структур (артикли, строгие союзы, пассивный залог, строгие модальные глаголы).
- **Экспорт в 1 клик**: копирование готовой графической схемы высокого разрешения в буфер обмена (`Ctrl+Enter`) для вставки в Google Docs, Microsoft Word или презентации.
- **История разборов**: сохранение предыдущих предложений с быстрым поиском, фильтрацией и синхронизацией.

---

## 🔒 Безопасность и конфиденциальность (100% Client-Side)

- **Полная автономность**: приложение работает полностью на стороне клиента в вашем браузере.
- **Zero-Telemetry**: никаких сторонних систем аналитики, трекеров или сбора персональных данных.
- **Безопасность API-ключей**: введённые ключи для Groq, PositionAPI или Custom API сохраняются **только** в локальном хранилище вашего браузера (`localStorage`). Они никогда не отправляются на сторонние серверы и передаются исключительно по прямому зашифрованному HTTPS-соединению к выбранному вами API.

---

## 👨‍💻 Автор и разработчик

- **Автор и ведущий разработчик**: **Nikita Kolyada**
- **Компания**: **[foma-creative.com](https://foma-creative.com)**
- **GitHub**: [@mrsky1001](https://github.com/mrsky1001)

---

## 📄 Лицензия

Проект распространяется под лицензией MIT. Подробности в файле [LICENSE](LICENSE).
