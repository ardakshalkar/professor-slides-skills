---
marp: true
title: Model evaluation and overfitting
module: MODULE-06
course_version: CSS-4008-2026-FALL
outcomes: [LO-02, LO-04]
concepts: [CONCEPT-MODEL-EVALUATION, CONCEPT-OVERFITTING]
generated_by: build-presentation-skill
---

# Model evaluation and overfitting

MODULE-06 · CSS-4008 2026-FALL · 5 October

---

## Where we are

- Last time: you split a dataset and trained a model on part of it
- Today: what the number that came out of that is, and is not, evidence for
- Builds on CONCEPT-TRAIN-TEST-SPLIT, taught in MODULE-05

---

## The number that meant nothing

Last week's report ended with a figure, and most of them were around 0.97 — every
one of them measured on the same rows the model had just been fitted to.

A score on the data you fitted to answers *did this model memorise these rows*.
It did. That is what fitting is.

---

## Three sets, and what each one is for

![Training data used to fit the model, validation data used to choose between
models, and a test set held back and never touched during
tuning](MODULE-06-slides-fig-01-split.svg)

---

## Overfitting, stated precisely

**Overfitting** is not "the score is too high". It is a model having captured
structure that is in *this sample* and not in the population it was drawn from.

The score is only the symptom, and it is a symptom you can see:

- Training performance keeps improving
- Held-out performance stops improving, then gets worse
- The gap between them is what grows

A model can overfit at 0.62 and generalise at 0.97. The number alone tells you
nothing; the pair of numbers tells you a great deal.

`CONCEPT-OVERFITTING`

---

## Reading two curves

Two runs on the same data, both plotted as training and validation error
against the number of training epochs.

**Run A** — training error falls to near zero, validation error bottoms out
around epoch 12 and then climbs steadily. The gap widens. This model is
memorising, and the useful model is the one from epoch 12, not the last one.

**Run B** — both curves fall together and flatten, close to each other, at a
much worse error than Run A ever reached on training data. No gap. This model
is not overfitting; it is simply not learning enough, and the fix is a larger
model or better features, not more regularisation.

The step people trip on is asking *which error is lower*. That is not the
diagnostic. The diagnostic is **which way the gap is moving**.

---

## Which score do you believe?

| Reported | What was measured on | Believe it? |
| --- | --- | --- |
| Accuracy after training | the rows the model was fitted to | No — this is memorisation |
| Best accuracy across 40 configurations | the validation set | No — you selected on it |
| Accuracy of the chosen model | a test set touched once | Yes, with its interval |

The middle row is the one that catches people, and it catches published papers
too. Choosing among forty models by validation score makes the validation score
a thing you optimised, which makes it a training score in every sense that
matters.

`CONCEPT-MODEL-EVALUATION`

---

## Check yourself

1. A classmate reports 0.99 accuracy. What is the first question you ask them,
   and what answer would make the number meaningless?
2. Training error 0.02, validation error 0.31, and the validation curve has been
   rising for ten epochs. Is this overfitting, underfitting, or not determinable
   from what you have been told?

---

## Next

- MODULE-07 takes the gap you just learned to read and asks what closes it
- Before then: the starter notebook (RES-442), through the first checkpoint
