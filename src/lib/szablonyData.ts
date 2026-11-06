/* Texts of the parent-message templates and the offer e-mail, moved here from the old "Szablony" HTML tool.
   Prices are not here: they come from the fee book (shared/fees.ts, editable in Opal5). */
/* eslint-disable */
export type Bi = { pl: string; en: string };
export interface TplItem { title: Bi; text: Bi }
export interface TplCategory { id: string; label: Bi; items?: TplItem[]; groups?: { name: Bi; items: TplItem[] }[] }

export const SIGNATURE: Bi = {"pl":"Martin z Maple Bear 🍁🐻","en":"Martin from Maple Bear 🍁🐻"};
export const TEMPLATES: TplCategory[] = [
 {
  "id": "hello",
  "label": {
   "pl": "Hello",
   "en": "Hello"
  },
  "items": [
   {
    "title": {
     "pl": "Hi 1",
     "en": "Hi 1"
    },
    "text": {
     "pl": "Dzień dobry,\nDostałem Państwa kontakt z naszej kampanii/reklamy na social media - chciałem zapytać, czy szukają Państwo przedszkola lub szkoły dla dziecka?",
     "en": "Hi,\nwe have received your contact from our campaign/social media ad - I wanted to ask, are you looking for a kindergarten or school for your child?"
    }
   },
   {
    "title": {
     "pl": "Hi 2",
     "en": "Hi 2"
    },
    "text": {
     "pl": "Dzień dobry,\npróbowałem się dodzwonić - niestety nie udało się :) Chciałem zapytać, czy nadal są Państwo zainteresowani naszą placówką?",
     "en": "Hi,\nI tried calling - unfortunately I couldn't reach you :) I wanted to ask, are you still interested in our school?"
    }
   },
   {
    "title": {
     "pl": "Krótki bump",
     "en": "Short bump"
    },
    "text": {
     "pl": "Dzień dobry,\nproszę o kontakt.",
     "en": "Hi,\ncould you give me a call when you have a moment?"
    }
   },
   {
    "title": {
     "pl": "Po wysłanej informacji",
     "en": "After sending info"
    },
    "text": {
     "pl": "Dzień dobry,\nwysłałem informacje o szkole z adresu martin.g@maplebearpolska.pl - jakby się nie pojawiły, proszę sprawdzić folder SPAM.",
     "en": "Hi,\nI sent over information about the school from martin.g@maplebearpolska.pl - if it didn't show up, please check your SPAM folder."
    }
   }
  ]
 },
 {
  "id": "pre_visit",
  "label": {
   "pl": "Pre-Visit",
   "en": "Pre-Visit"
  },
  "items": [
   {
    "title": {
     "pl": "Potwierdzenie wizyty",
     "en": "Visit confirmation"
    },
    "text": {
     "pl": "Dzień dobry,\nchciałem potwierdzić zapis na wizytę w szkole i mailowo przesłałem informacje z adresu martin.g@maplebearpolska.pl - proszę sprawdzić też folder SPAM, gdyby wiadomość się nie pojawiła.",
     "en": "Hi,\nI wanted to confirm your visit booking at the school, and I've emailed over some information from martin.g@maplebearpolska.pl - please also check your SPAM folder in case it doesn't show up."
    }
   },
   {
    "title": {
     "pl": "Scheduling Visit 1",
     "en": "Scheduling Visit 1"
    },
    "text": {
     "pl": "Dzień dobry,\nchciałem zapytać, czy udało się Państwu zapoznać z przesłanymi materiałami. Czy wszystko jest zrozumiałe? Czy są Państwo zainteresowani?",
     "en": "Hi,\nI wanted to ask whether you've had a chance to look through the materials I sent. Is everything clear? Are you still interested?"
    }
   },
   {
    "title": {
     "pl": "Scheduling Visit 2",
     "en": "Scheduling Visit 2"
    },
    "text": {
     "pl": "Dzień dobry,\nwidziałem, że nie udało się jeszcze umówić wizyty - może mogę jakoś pomóc? Jeśli terminy w kalendarzu nie odpowiadają, chętnie zaproponuję inne.",
     "en": "Hi,\nI noticed you haven't booked a visit yet - can I help with that? If the calendar slots don't work for you, I'm happy to suggest other times."
    }
   },
   {
    "title": {
     "pl": "Visit Reminder",
     "en": "Visit Reminder"
    },
    "text": {
     "pl": "Dzień dobry,\nchciałem przypomnieć o jutrzejszej wizycie.",
     "en": "Hi,\nI wanted to remind you about tomorrow's visit."
    }
   }
  ]
 },
 {
  "id": "pre_trial",
  "label": {
   "pl": "Pre-Trial",
   "en": "Pre-Trial"
  },
  "items": [
   {
    "title": {
     "pl": "Scheduling Trial Day 1",
     "en": "Scheduling Trial Day 1"
    },
    "text": {
     "pl": "Dzień dobry,\nchciałem zapytać, czy są Państwo nadal zainteresowani dniem próbnym?",
     "en": "Hi,\nI wanted to ask - are you still interested in the trial day?"
    }
   },
   {
    "title": {
     "pl": "Scheduling Trial Day 2",
     "en": "Scheduling Trial Day 2"
    },
    "text": {
     "pl": "Dzień dobry,\npróbowałem się dodzwonić - niestety nie udało się :) Chciałem zapytać, czy nadal są Państwo zainteresowani dniem próbnym?",
     "en": "Hi,\nI tried calling - unfortunately I couldn't reach you :) I wanted to ask, are you still interested in the trial day?"
    }
   }
  ]
 },
 {
  "id": "decision",
  "label": {
   "pl": "Decision",
   "en": "Decision"
  },
  "items": [
   {
    "title": {
     "pl": "Polityka rezerwacji miejsca",
     "en": "Spot reservation policy"
    },
    "text": {
     "pl": "Dzień dobry,\n\nChciałem jeszcze wyjaśnić jak wygląda u nas polityka rezerwacji miejsca.\nDołączają Państwo do grupy, która już istnieje i się rozwija - nie jestem w stanie zagwarantować miejsca jeśli Państwo zdecydują się dopiero w przyszłym roku szkolnym.\n\nJeśli jednak są Państwo już zdecydowani - możemy spotkać się i podpisać umowę teraz, z datą startu jaką wspólnie ustalimy. Jeśli coś się zmieni, umowę można anulować - opłata rekrutacyjna jest zwracana w 50%. Aktualnie mamy promocję i opłata wynosi symbolicznie 650 zł.\n\nW zamian mają Państwo zagwarantowane miejsce w szkole.\nJeśli mają Państwo pytania - proszę śmiało pisać!",
     "en": "Hi,\n\nI wanted to explain how our spot-reservation policy works.\nYou'd be joining a group that already exists and is growing - I can't guarantee a spot if you decide to wait until next school year.\n\nIf you're already decided, though, we can meet and sign the contract now, with a start date we agree on together. If anything changes, the contract can be cancelled - the enrollment fee is refunded at 50%. Right now we have a promotion, so the fee is a symbolic 650 PLN.\n\nIn return, you have a guaranteed spot at the school.\nIf you have any questions, feel free to reach out!"
    }
   },
   {
    "title": {
     "pl": "Jak podpisać umowę",
     "en": "How to sign the contract"
    },
    "text": {
     "pl": "Dzień dobry,\n\nmogą Państwo podpisać umowę na kilka sposobów - możemy się umówić na podpis na miejscu w szkole, albo mogą Państwo podpisać dokument zdalnie.\n\nZdalnie wystarczy odesłać skan lub zdjęcie podpisanych dokumentów, skorzystać z podpisu kwalifikowanego, albo edytować plik PDF i podpisać się - na przykład palcem na telefonie.\n\nPo podpisaniu umowy mają Państwo do 2 tygodni na przesłanie opłaty rekrutacyjnej.",
     "en": "Hi,\n\nyou can sign the contract in a few ways - we can meet in person at the school, or you can sign it remotely.\n\nRemotely, you can send back a scan or photo of the signed documents, use a qualified electronic signature, or edit the PDF and sign it - for example with your finger on your phone.\n\nAfter signing, you have up to 2 weeks to send the enrollment fee payment."
    }
   },
   {
    "title": {
     "pl": "Prawie na miejscu!",
     "en": "Almost there!"
    },
    "text": {
     "pl": "Dzień dobry,\n\nsą Państwo już bardzo blisko dołączenia do naszej społeczności Maple Bear! Cieszymy się, że rozważacie nas jako partnera w edukacji [imię dziecka].\n\nŻeby ta przygoda mogła się jak najszybciej zacząć, został tylko jeden krok - odesłanie podpisanego kontraktu. Czekamy z niecierpliwością!\n\nJeśli czegoś jeszcze potrzeba z naszej strony - dajcie znać, chętnie pomożemy domknąć formalności.",
     "en": "Hi,\n\nyou're already very close to joining our Maple Bear community! We're glad you're considering us as a partner in [child's name]'s education.\n\nTo get this journey started as soon as possible, there's just one step left - sending back the signed contract. We can't wait!\n\nIf there's anything you still need from us, just let us know - happy to help wrap things up."
    }
   }
  ]
 },
 {
  "id": "bye",
  "label": {
   "pl": "Bye",
   "en": "Bye"
  },
  "items": [
   {
    "title": {
     "pl": "Bye cold",
     "en": "Bye cold"
    },
    "text": {
     "pl": "Dzień dobry,\n\nPróbowałem się z Państwem skontaktować, niestety się nie udało - możliwe też, że kontakt trafił do nas przez przypadek.\n\nJeśli jednak szukają Państwo szkoły lub przedszkola, albo Państwa plany się zmienią - proszę śmiało się odezwać.",
     "en": "Hi,\n\nI tried reaching you, but unfortunately couldn't get through - it's also possible your contact reached us by mistake.\n\nIf you're still looking for a school or kindergarten, or your plans change, please feel free to reach out."
    }
   },
   {
    "title": {
     "pl": "Bye hot",
     "en": "Bye hot"
    },
    "text": {
     "pl": "Dzień dobry,\n\nPróbowałem się z Państwem skontaktować, niestety się nie udało - możliwe też, że kontakt trafił do nas przez przypadek.\n\nNa ten moment zamykam Państwa proces rekrutacyjny.\n\nJeśli to nie kłopot - będę wdzięczny za informację, co wpłynęło na decyzję rezygnacji.",
     "en": "Hi,\n\nI tried reaching you, but unfortunately couldn't get through - it's also possible your contact reached us by mistake.\n\nI'm closing your family's enrollment process for now.\n\nIf you don't mind sharing - I'd be grateful to know what led to this decision."
    }
   },
   {
    "title": {
     "pl": "Brak odpowiedzi (krótka)",
     "en": "No answer (short)"
    },
    "text": {
     "pl": "Dzień dobry!\nPróbowałem się z Państwem kilkukrotnie skontaktować - niestety się nie udało :)\nZamykam więc ten wątek.\nJeśli jednak szukają Państwo szkoły lub przedszkola - proszę się odezwać.",
     "en": "Good morning!\nI've tried reaching you a few times - unfortunately it didn't work out :)\nI'm closing this thread for now.\nIf you're still looking for a school or kindergarten, please get in touch."
    }
   }
  ]
 },
 {
  "id": "other",
  "label": {
   "pl": "Inne",
   "en": "Other"
  },
  "groups": [
   {
    "name": {
     "pl": "Ambassadors Club",
     "en": "Ambassadors Club"
    },
    "items": [
     {
      "title": {
       "pl": "Zaproszenie do programu",
       "en": "Program invitation"
      },
      "text": {
       "pl": "Dzień dobry,\nmamy dla Państwa propozycję - Ambassadors Club. Za polecenie rodziny, która podpisze umowę, płacicie 1 zł za miesiąc czesnego. Zainteresowani?",
       "en": "Hi,\nwe have something for you - our Ambassadors Club. Refer a family that signs up, and you get a month of tuition for 1 PLN. Interested?"
      }
     }
    ]
   },
   {
    "name": {
     "pl": "Opinia Google",
     "en": "Google review"
    },
    "items": [
     {
      "title": {
       "pl": "Standard",
       "en": "Standard"
      },
      "text": {
       "pl": "Dzień dobry,\nbędzie nam bardzo miło, jeśli zechcą Państwo podzielić się opinią na Google - zajmuje to dosłownie chwilę: https://g.page/r/CQGo5uOEegoLEBM/review",
       "en": "Hi,\nwe'd really appreciate it if you could leave us a Google review - it only takes a moment: https://g.page/r/CQGo5uOEegoLEBM/review"
      }
     },
     {
      "title": {
       "pl": "Po summer camp",
       "en": "After summer camp"
      },
      "text": {
       "pl": "Dzień dobry,\nmamy nadzieję, że się podobał! Będziemy bardzo wdzięczni, jeśli podzielą się Państwo opinią na Google: https://g.page/r/CQGo5uOEegoLEBM/review\n\nPozdrawiam,\nDawid",
       "en": "Hi,\nwe hope you enjoyed it! We'd be really grateful if you could share your feedback on Google: https://g.page/r/CQGo5uOEegoLEBM/review\n\nBest,\nDawid"
      }
     }
    ]
   }
  ]
 }
];

export const MOD_ORDER: string[] = ["confirm","hello","pricing","included","process","directions","schedule","od","trial","after_visit","survey","visit_cta","enrollment_confirm","welcome_aboard"];
export const MODULES: { id: string; label: Bi; desc: Bi }[] = [
 {
  "id": "confirm",
  "label": {
   "pl": "Potwierdzenie wizyty",
   "en": "Visit confirmation"
  },
  "desc": {
   "pl": "Dziękuję + potwierdzenie zapisu",
   "en": "Thank you + booking confirmation"
  }
 },
 {
  "id": "hello",
  "label": {
   "pl": "Hello / Intro",
   "en": "Hello / Intro"
  },
  "desc": {
   "pl": "Powitanie + 5 filarów",
   "en": "Greeting + 5 pillars"
  }
 },
 {
  "id": "pricing",
  "label": {
   "pl": "Cennik + zniżki",
   "en": "Pricing + discounts"
  },
  "desc": {
   "pl": "Czesne, opłaty i rabaty",
   "en": "Tuition, fees & discounts"
  }
 },
 {
  "id": "included",
  "label": {
   "pl": "Co w cenie",
   "en": "Included"
  },
  "desc": {
   "pl": "Co obejmuje czesne",
   "en": "What tuition covers"
  }
 },
 {
  "id": "process",
  "label": {
   "pl": "Proces rekrutacji",
   "en": "Enrolment process"
  },
  "desc": {
   "pl": "4 kroki do Maple Bear",
   "en": "4 steps to join"
  }
 },
 {
  "id": "directions",
  "label": {
   "pl": "Dojazd",
   "en": "Directions"
  },
  "desc": {
   "pl": "Jak do nas dotrzeć",
   "en": "How to find us"
  }
 },
 {
  "id": "schedule",
  "label": {
   "pl": "Plan dnia",
   "en": "Daily schedule"
  },
  "desc": {
   "pl": "Linki do planów",
   "en": "Download links"
  }
 },
 {
  "id": "od",
  "label": {
   "pl": "Dzień Otwarty",
   "en": "Open Day"
  },
  "desc": {
   "pl": "Harmonogram OD",
   "en": "OD schedule"
  }
 },
 {
  "id": "trial",
  "label": {
   "pl": "Dzień próbny",
   "en": "Trial day"
  },
  "desc": {
   "pl": "Info o trial day",
   "en": "Trial day info"
  }
 },
 {
  "id": "after_visit",
  "label": {
   "pl": "Po wizycie",
   "en": "After visit"
  },
  "desc": {
   "pl": "Umowy i prezentacja",
   "en": "Contracts & pres."
  }
 },
 {
  "id": "survey",
  "label": {
   "pl": "Ankieta przed wizytą",
   "en": "Pre-visit survey"
  },
  "desc": {
   "pl": "6 pytań przed spotkaniem",
   "en": "6 questions before meeting"
  }
 },
 {
  "id": "visit_cta",
  "label": {
   "pl": "Umów wizytę",
   "en": "Book a visit"
  },
  "desc": {
   "pl": "Przycisk kalendarza",
   "en": "Calendar button"
  }
 },
 {
  "id": "enrollment_confirm",
  "label": {
   "pl": "Prawie na miejscu!",
   "en": "Almost there!"
  },
  "desc": {
   "pl": "Motywacja do dokończenia zapisu",
   "en": "Nudge to complete enrollment"
  }
 },
 {
  "id": "welcome_aboard",
  "label": {
   "pl": "Witamy na pokładzie!",
   "en": "Welcome aboard!"
  },
  "desc": {
   "pl": "Zapis gotowy, wysyłamy kontrakt",
   "en": "Enrollment complete, sending contract"
  }
 }
];
export const PLACES: Record<string, any> = {
 "katowice": {
  "calLink": "https://calendar.app.google/L9C5AazgTACpPQP48",
  "mapsLink": "https://www.google.com/maps/dir/?api=1&destination=50.2605682,19.0185005&destination_place_id=ChIJ0_Y92NPPFkcRAajm44R6Cgs",
  "process": {
   "pl": {
    "intro": "Dołączenie do nas to cztery proste kroki, bez stresu i w atmosferze otwartości, którą żyjemy każdego dnia.",
    "steps": [
     {
      "n": "1",
      "title": "Kontakt",
      "body": "Zadzwoń lub wypełnij formularz. Prześlemy Ci materiały, które warto poznać przed wizytą."
     },
     {
      "n": "2",
      "title": "Wizyta w szkole",
      "body": "Przyjdź na spotkanie lub Dzień Otwarty. Poznaj dyrekcję i nauczycieli, zobacz nasz hybrydowy program i obejrzyj kampus: plac zabaw oraz dwie sale gimnastyczne."
     },
     {
      "n": "3",
      "title": "Experience Day",
      "body": "Twoje dziecko spędzi u nas kilka godzin. Pozna nauczycieli i kolegów, weźmie udział w zajęciach i poczuje atmosferę otwartości i ciekawości, którą żyjemy każdego dnia."
     },
     {
      "n": "4",
      "title": "Decyzja",
      "body": "Gdy decyzja zapadnie, podpiszemy umowę i ustalimy warunki płatności. Witamy Twoje dziecko w Maple Bear."
     }
    ]
   },
   "en": {
    "intro": "Joining us is four simple steps - no stress, just the open and welcoming atmosphere we live by every day.",
    "steps": [
     {
      "n": "1",
      "title": "Get in touch",
      "body": "Call us or fill in the form. We will send you materials worth reviewing before your visit."
     },
     {
      "n": "2",
      "title": "Visit the school",
      "body": "Come to a meeting or an Open Day. Meet the leadership and teachers, see our hybrid programme and tour the campus: playground and two gyms."
     },
     {
      "n": "3",
      "title": "Experience Day",
      "body": "Your child will spend a few hours with us. They will meet the teachers and classmates, take part in classes, and experience the atmosphere of openness and curiosity we live by every day."
     },
     {
      "n": "4",
      "title": "Decision",
      "body": "Once you decide, we sign the contract and agree on payment terms. Welcome to Maple Bear."
     }
    ]
   }
  },
  "directions": {
   "pl": {
    "address": "ul. Stawowa 6, 40-095 Katowice",
    "items": [
     {
      "icon": "🚗",
      "title": "Samochodem",
      "body": "Rekomendujemy parking w Galerii Katowickiej - 1 godzina gratis. Dla rodziców zapisanych dzieci dostępne są 2 dedykowane miejsca parkingowe oznaczone tabliczką Maple Bear przy szkole."
     },
     {
      "icon": "🚆",
      "title": "Komunikacją miejską",
      "body": "Placówka znajduje się w pobliżu Dworca PKP Katowice - doskonały dojazd autobusami, tramwajami i pociągami z całej aglomeracji."
     }
    ]
   },
   "en": {
    "address": "ul. Stawowa 6, 40-095 Katowice",
    "items": [
     {
      "icon": "🚗",
      "title": "By car",
      "body": "We recommend parking at Galeria Katowicka - 1 hour free. For parents of enrolled children, 2 dedicated Maple Bear parking spaces are available on site."
     },
     {
      "icon": "🚆",
      "title": "Public transport",
      "body": "The school is located near Katowice Main Railway Station, with easy access by bus, tram and train from across the metropolitan area."
     }
    ]
   }
  }
 },
 "krakow": {
  "calLink": "https://calendar.app.google/r4iBnKeXJpRG4uCF9",
  "mapsLink": "https://www.google.com/maps/dir/?api=1&destination=50.0375974,19.9814333&destination_place_id=ChIJ7T6eyx1FFkcRO-O1KMIvP_k",
  "process": {
   "pl": {
    "intro": "Dołączenie do nas to cztery proste kroki, bez stresu i w atmosferze otwartości, którą żyjemy każdego dnia.",
    "steps": [
     {
      "n": "1",
      "title": "Kontakt",
      "body": "Zadzwoń lub wypełnij formularz. Prześlemy Ci materiały, które warto poznać przed wizytą."
     },
     {
      "n": "2",
      "title": "Wizyta w szkole",
      "body": "Przyjdź na spotkanie lub Dzień Otwarty. Poznaj dyrekcję i nauczycieli i poczuj atmosferę Maple Bear Kraków."
     },
     {
      "n": "3",
      "title": "Experience Day",
      "body": "Twoje dziecko spędzi u nas kilka godzin. Pozna nauczycieli i kolegów, weźmie udział w zajęciach i poczuje atmosferę otwartości i ciekawości, którą żyjemy każdego dnia."
     },
     {
      "n": "4",
      "title": "Decyzja",
      "body": "Gdy decyzja zapadnie, podpiszemy umowę i ustalimy warunki płatności. Witamy Twoje dziecko w Maple Bear."
     }
    ]
   },
   "en": {
    "intro": "Joining us is four simple steps - no stress, just the open and welcoming atmosphere we live by every day.",
    "steps": [
     {
      "n": "1",
      "title": "Get in touch",
      "body": "Call us or fill in the form. We will send you materials worth reviewing before your visit."
     },
     {
      "n": "2",
      "title": "Visit the school",
      "body": "Come to a meeting or an Open Day. Meet the leadership and teachers and experience the Maple Bear Kraków atmosphere."
     },
     {
      "n": "3",
      "title": "Experience Day",
      "body": "Your child will spend a few hours with us. They will meet the teachers and classmates, take part in classes, and experience the atmosphere of openness and curiosity we live by every day."
     },
     {
      "n": "4",
      "title": "Decision",
      "body": "Once you decide, we sign the contract and agree on payment terms. Welcome to Maple Bear."
     }
    ]
   }
  },
  "directions": {
   "pl": {
    "address": "ul. Saska 25D, 30-720 Kraków (The Park Kraków)",
    "items": [
     {
      "icon": "🚶",
      "title": "Pieszo / Samochodem",
      "body": "Proszę kierować się w stronę budynku 25 przy ul. Saskiej, a następnie szukać budynku 25D na terenie kompleksu The Park Kraków. Na teren kampusu można wejść ścieżkami dla pieszych. Oznaczenia Maple Bear prowadzą na parter budynku 25D. W recepcji prosimy poinformować o celu wizyty - pracownicy otworzą wejście."
     },
     {
      "icon": "🚗",
      "title": "Garaż podziemny",
      "body": "Wjazd z tyłu budynku. Przy szlabanie prosimy skorzystać z interkomu i wybrać \"Maple Bear Guest\". Parking dla gości jest oznaczony. Przed wyjazdem prosimy skasować bilet parkingowy w recepcji."
     }
    ]
   },
   "en": {
    "address": "ul. Saska 25D, 30-720 Kraków (The Park Kraków)",
    "items": [
     {
      "icon": "🚶",
      "title": "Walking / Driving",
      "body": "Head toward building 25 on Saska Street, then look for building 25D within The Park Kraków complex. Enter via pedestrian paths - the complex has green courtyards and signage. Follow Maple Bear signs to the ground floor of 25D. At reception, let staff know the reason for your visit - they will buzz you in."
     },
     {
      "icon": "🚗",
      "title": "Underground garage",
      "body": "Access from the rear of the building. At the barrier, use the intercom and select \"Maple Bear Guest.\" Park in designated guest spaces. Please validate your parking ticket at reception before leaving."
     }
    ]
   }
  }
 },
 "wroclaw": {
  "calLink": "https://calendar.app.google/J8LCtBbJA7LHRgVm8",
  "mapsLink": "https://www.google.com/maps/dir/?api=1&destination=51.101019,17.0415919&destination_place_id=ChIJIbQ3lTnDD0cRBgu2XIL92Mc",
  "process": {
   "pl": {
    "intro": "Dołączenie do nas to cztery proste kroki, bez stresu i w atmosferze otwartości, którą żyjemy każdego dnia.",
    "steps": [
     {
      "n": "1",
      "title": "Kontakt",
      "body": "Zadzwoń lub wypełnij formularz. Prześlemy Ci materiały, które warto poznać przed wizytą."
     },
     {
      "n": "2",
      "title": "Wizyta w szkole",
      "body": "Przyjdź na spotkanie lub Dzień Otwarty. Poznaj dyrekcję i nauczycieli i poczuj atmosferę Maple Bear Wrocław."
     },
     {
      "n": "3",
      "title": "Experience Day",
      "body": "Twoje dziecko spędzi u nas kilka godzin. Pozna nauczycieli i kolegów, weźmie udział w zajęciach i poczuje atmosferę otwartości i ciekawości, którą żyjemy każdego dnia."
     },
     {
      "n": "4",
      "title": "Decyzja",
      "body": "Gdy decyzja zapadnie, podpiszemy umowę i ustalimy warunki płatności. Witamy Twoje dziecko w Maple Bear."
     }
    ]
   },
   "en": {
    "intro": "Joining us is four simple steps - no stress, just the open and welcoming atmosphere we live by every day.",
    "steps": [
     {
      "n": "1",
      "title": "Get in touch",
      "body": "Call us or fill in the form. We will send you materials worth reviewing before your visit."
     },
     {
      "n": "2",
      "title": "Visit the school",
      "body": "Come to a meeting or an Open Day. Meet the leadership and teachers and experience the Maple Bear Wrocław atmosphere."
     },
     {
      "n": "3",
      "title": "Experience Day",
      "body": "Your child will spend a few hours with us. They will meet the teachers and classmates, take part in classes, and experience the atmosphere of openness and curiosity we live by every day."
     },
     {
      "n": "4",
      "title": "Decision",
      "body": "Once you decide, we sign the contract and agree on payment terms. Welcome to Maple Bear."
     }
    ]
   }
  },
  "directions": {
   "pl": {
    "address": "ul. T. Kościuszki 84, Wrocław",
    "items": [
     {
      "icon": "🚃",
      "title": "Komunikacja miejska",
      "body": "Przystanek \"Kościuszki\" znajduje się kilkadziesiąt metrów od wejścia. Tramwaje linii 0, 3, 4 i 9. Z Dworca Głównego PKP: spacer ok. 10 minut lub tramwaj linii 0 bezpośrednio pod szkołę."
     },
     {
      "icon": "🚗",
      "title": "Samochodem",
      "body": "Szkoła leży w centrum, w strefie płatnego parkowania. Miejsca postojowe dostępne wzdłuż ul. Kościuszki i na okolicznych ulicach (Pułaskiego, Małachowskiego). Parking przy samej szkole jest ograniczony, dlatego rekomendujemy komunikację miejską lub pobliskie parkingi."
     }
    ]
   },
   "en": {
    "address": "ul. T. Kościuszki 84, Wrocław",
    "items": [
     {
      "icon": "🚃",
      "title": "Public transport",
      "body": "The \"Kościuszki\" stop is just a few dozen metres from the entrance. Tram lines 0, 3, 4 and 9. From Wrocław Main Railway Station: approx. 10 minutes on foot or tram line 0 directly to the school."
     },
     {
      "icon": "🚗",
      "title": "By car",
      "body": "The school is centrally located in a paid parking zone. Street parking is available along ul. Kościuszki and nearby streets (Pułaskiego, Małachowskiego). As parking near the school is limited, we recommend public transport or nearby car parks."
     }
    ]
   }
  }
 }
};
export const T: Record<string, any> = {
 "greeting": {
  "pl": "Dzień dobry,",
  "en": "Good morning,"
 },
 "confirm_body": {
  "pl": "Dziękuję za zainteresowanie ofertą Maple Bear. Chciałem potwierdzić Państwa zapis na wizytę w naszej szkole.\nPoniżej przesyłam kluczowe informacje o naszej placówce.",
  "en": "Thank you for your interest in Maple Bear. I wanted to confirm your booking for a visit to our school.\nBelow you'll find key information about our school."
 },
 "enrollment_title": {
  "pl": "Prawie na miejscu!",
  "en": "Almost there!"
 },
 "enrollment_intro": {
  "pl": "Dziękujemy, że rozważacie nas Państwo jako partnera w edukacji [imię dziecka]. W załącznikach znajdą Państwo dokumenty do podpisu.",
  "en": "Thank you for considering us as a partner in your child's education. Please find the documents to sign attached."
 },
 "enrollment_sign_title": {
  "pl": "Umowę można podpisać:",
  "en": "You can sign the contract:"
 },
 "enrollment_sign_options": {
  "pl": [
   "Na miejscu w szkole",
   "Odsyłając skan lub zdjęcie podpisanych dokumentów",
   "Podpisem kwalifikowanym",
   "Edytując plik PDF i podpisując się - na przykład palcem na telefonie"
  ],
  "en": [
   "In person at school",
   "By sending back a scan or photo of the signed documents",
   "With a qualified electronic signature",
   "By editing the PDF and signing it - for example with your finger on your phone"
  ]
 },
 "enrollment_payment": {
  "pl": "Po podpisaniu umowy mają Państwo do 2 tygodni na przesłanie opłaty rekrutacyjnej na konto (przedszkole): 72 1140 1010 0000 3992 9700 1004.",
  "en": "After signing, you have up to 2 weeks to send the enrollment fee payment to the account (kindergarten): 72 1140 1010 0000 3992 9700 1004."
 },
 "enrollment_question": {
  "pl": "Proszę dać znać, jaką formę podpisu dokumentów Państwo wybierają i orientacyjnie kiedy możemy się ich spodziewać.",
  "en": "Please let us know which method you'll use to send the documents back, and roughly when we can expect them."
 },
 "welcome_title": {
  "pl": "Witamy na pokładzie!",
  "en": "Welcome aboard!"
 },
 "welcome_body": {
  "pl": "Z przyjemnością informujemy, że zapis [imię dziecka] do Maple Bear jest już sfinalizowany.\n\nW załączniku przesyłamy podpisany egzemplarz umowy - do Państwa archiwum.\n\nBardzo się cieszymy, że będziemy mogli razem towarzyszyć [imię dziecka] w tej edukacyjnej podróży. W najbliższym czasie prześlemy więcej informacji organizacyjnych przed rozpoczęciem nauki.",
  "en": "We're pleased to let you know that [child's name]'s enrollment at Maple Bear is now finalized.\n\nAttached you'll find a signed copy of the contract for your records.\n\nWe're delighted to accompany [child's name] on this educational journey. We'll be in touch soon with more organizational details ahead of the start date."
 },
 "welcome_closing": {
  "pl": "Jeśli pojawią się jakiekolwiek pytania - jesteśmy do Państwa dyspozycji.",
  "en": "If any questions come up, we're here to help."
 },
 "hello_body": {
  "pl": "Dziękujemy za zainteresowanie ofertą Maple Bear. Przesyłamy kluczowe informacje o naszej placówce.",
  "en": "Thank you for your interest in Maple Bear. Please find the key information about our school below."
 },
 "pillars_title": {
  "pl": "5 filarów naszej edukacji",
  "en": "The 5 pillars of our education"
 },
 "pillars": {
  "pl": [
   "Canada Education Superpower - edukacja \"Made in Canada\", uznawana za jedną z najlepszych na świecie.",
   "Bilingual Education - angielski nie jest u nas lekcją, to język, w którym dzieci myślą i działają.",
   "Unique Positioning - to, co najlepsze z polskiego i kanadyjskiego systemu w jednej szkole.",
   "Program, Training & Quality Assurance - nauczyciele podwójnie weryfikowani i szkoleni przez ekspertów z Kanady.",
   "Global Education Network - część globalnej sieci ponad 500 szkół."
  ],
  "en": [
   "Canada Education Superpower - \"Made in Canada\" education, recognised as one of the best in the world.",
   "Bilingual Education - English is not just a lesson; it is the language children think and act in.",
   "Unique Positioning - the best of the Polish and Canadian systems in one school.",
   "Program, Training & Quality Assurance - teachers doubly verified and trained by Canadian experts.",
   "Global Education Network - part of a global network of over 500 schools."
  ]
 },
 "pricing_title": {
  "pl": "Cennik 2026/2027",
  "en": "Pricing 2026/2027"
 },
 "discounts_title": {
  "pl": "Zniżki i promocje",
  "en": "Discounts & promotions"
 },
 "col_stage": {
  "pl": "Etap",
  "en": "Stage"
 },
 "col_tuition": {
  "pl": "Czesne / mies.",
  "en": "Tuition / mo"
 },
 "col_reg": {
  "pl": "Opłata rekrutacyjna (jednorazowo)",
  "en": "Enrolment fee (one-time)"
 },
 "included_title": {
  "pl": "Co obejmuje czesne",
  "en": "What's included in tuition"
 },
 "process_title": {
  "pl": "Jak dołączyć do Maple Bear",
  "en": "How to join Maple Bear"
 },
 "directions_title": {
  "pl": "Jak do nas dotrzeć",
  "en": "How to find us"
 },
 "navigate_btn": {
  "pl": "Nawiguj w Google Maps →",
  "en": "Navigate in Google Maps →"
 },
 "materials_title": {
  "pl": "Materiały dla Państwa",
  "en": "Materials for you"
 },
 "mat_items": {
  "pl": [
   {
    "type": "Wideo",
    "title": "Dzień z życia Maple Bear",
    "desc": "Zobacz, jak wygląda nauka oparta na ciekawości i kreatywności.",
    "link": "https://www.youtube.com/watch?v=I8msha_6_vQ",
    "cta": "Obejrzyj na YouTube →"
   },
   {
    "type": "Publikacja",
    "title": "Magazyn \"The Bear\"",
    "desc": "Innowacje edukacyjne i sukcesy uczniów Maple Bear z całego świata.",
    "link": "https://issuu.com/maplebearcee/docs/the_bear_2025_2026_hq",
    "cta": "Przeczytaj najnowszy numer →"
   },
   {
    "type": "PDF",
    "title": "Prezentacja Maple Bear",
    "desc": "Krótki przewodnik po filozofii i globalnej sieci szkół.",
    "link": "https://drive.google.com/file/d/1_nlMAkT1B_0-4loQF69tlZ5UZAM3nqSv/view",
    "cta": "Pobierz prezentację →"
   }
  ],
  "en": [
   {
    "type": "Video",
    "title": "A day in the life of Maple Bear",
    "desc": "See how learning based on curiosity and creativity looks in practice.",
    "link": "https://www.youtube.com/watch?v=FWxu-PL5yQo",
    "cta": "Watch on YouTube →"
   },
   {
    "type": "Publication",
    "title": "\"The Bear\" Magazine",
    "desc": "Educational innovations and student successes from around the world.",
    "link": "https://issuu.com/maplebearcee/docs/the_bear_2025_2026_hq",
    "cta": "Read the latest issue →"
   },
   {
    "type": "PDF",
    "title": "Maple Bear presentation",
    "desc": "A short guide to our philosophy and global school network.",
    "link": "https://drive.google.com/file/d/1_nlMAkT1B_0-4loQF69tlZ5UZAM3nqSv/view",
    "cta": "Download presentation →"
   }
  ]
 },
 "sched_title": {
  "pl": "Plany dnia",
  "en": "Daily schedules"
 },
 "sched_desc": {
  "pl": "Szczegółowy rozkład zajęć dla wszystkich klas w jednym pliku.",
  "en": "A detailed timetable for all year groups in one file."
 },
 "sched_items": {
  "pl": [
   "Wszystkie klasy (Nursery - Grade 6)"
  ],
  "en": [
   "All grades (Nursery - Grade 6)"
  ]
 },
 "sched_links": [
  "https://drive.google.com/file/d/1-kXQFtKGKS-WI99mmdY5NSOGoJfn8iJX/view?usp=sharing"
 ],
 "sched_cta": {
  "pl": "Pobierz",
  "en": "Download"
 },
 "od_title": {
  "pl": "Plan Dnia Otwartego",
  "en": "Open Day schedule"
 },
 "od_items": {
  "pl": [
   [
    "9:45",
    "Powitanie i rejestracja - dzieci do sali, rodzice na kawę"
   ],
   [
    "10:00-10:30",
    "Prezentacja dla rodziców + zajęcia dla dzieci (równolegle)"
   ],
   [
    "10:30-11:00",
    "Zwiedzanie szkoły"
   ],
   [
    "11:00-12:00",
    "Sesja Q&A - czas na Państwa pytania"
   ]
  ],
  "en": [
   [
    "9:45",
    "Welcome & registration - children to class, parents for coffee"
   ],
   [
    "10:00-10:30",
    "Parent presentation + children's activities (parallel)"
   ],
   [
    "10:30-11:00",
    "School tour"
   ],
   [
    "11:00-12:00",
    "Q&A session - your questions answered"
   ]
  ]
 },
 "trial_title": {
  "pl": "Dzień Próbny",
  "en": "Trial Day"
 },
 "trial_start": {
  "pl": "Start: 8:30",
  "en": "Start: 8:30"
 },
 "trial_bring_title": {
  "pl": "Co zabrać ze sobą?",
  "en": "What to bring?"
 },
 "trial_items": {
  "pl": [
   "Zmienną parę butów",
   "Butelkę na wodę",
   "Dużo uśmiechu i pozytywnej energii!"
  ],
  "en": [
   "A spare pair of shoes",
   "A water bottle",
   "Lots of smiles and positive energy!"
  ]
 },
 "trial_meals": {
  "pl": "Posiłki (w tym śniadanie) będą przygotowane na miejscu.",
  "en": "Meals (including breakfast) will be prepared on site."
 },
 "after_title": {
  "pl": "Materiały po wizycie",
  "en": "After your visit"
 },
 "after_intro": {
  "pl": "W załączeniu znajdziecie Państwo prezentację oraz wzory umów do wglądu przed podpisaniem.",
  "en": "Please find attached our presentation and sample contracts for your review before signing."
 },
 "after_items": {
  "pl": [
   {
    "type": "PDF",
    "title": "Prezentacja Maple Bear",
    "desc": "Przewodnik po filozofii, programie i globalnej sieci szkół.",
    "link": "https://drive.google.com/file/d/1qMWh-BFPfjr3C7ibt1LeaAxtzLmq_CVW/view?usp=sharing",
    "cta": "Pobierz prezentację →"
   },
   {
    "type": "PDF",
    "title": "Wzór umowy - przedszkole",
    "desc": "Wzór umowy o świadczenie usług edukacyjnych.",
    "link": "https://drive.google.com/file/d/1j4_emrBmfY8aYtEHuZGxVJrThDkoGXvq/view?usp=sharing",
    "cta": "Pobierz wzór →"
   },
   {
    "type": "PDF",
    "title": "Wzór umowy - szkoła podstawowa",
    "desc": "Wzór umowy o świadczenie usług edukacyjnych.",
    "link": "https://drive.google.com/file/d/1HVZ5en2jSXdPLKSbAZHWGeYN9yFiodfY/view?usp=sharing",
    "cta": "Pobierz wzór →"
   }
  ],
  "en": [
   {
    "type": "PDF",
    "title": "Maple Bear presentation",
    "desc": "Guide to our philosophy, programme and global school network.",
    "link": "https://drive.google.com/file/d/1qMWh-BFPfjr3C7ibt1LeaAxtzLmq_CVW/view?usp=sharing",
    "cta": "Download →"
   },
   {
    "type": "PDF",
    "title": "Contract template - kindergarten",
    "desc": "Sample service agreement for your review.",
    "link": "https://drive.google.com/file/d/1j4_emrBmfY8aYtEHuZGxVJrThDkoGXvq/view?usp=sharing",
    "cta": "Download →"
   },
   {
    "type": "PDF",
    "title": "Contract template - primary school",
    "desc": "Sample service agreement for your review.",
    "link": "https://drive.google.com/file/d/1HVZ5en2jSXdPLKSbAZHWGeYN9yFiodfY/view?usp=sharing",
    "cta": "Download →"
   }
  ]
 },
 "survey_title": {
  "pl": "Kilka pytań przed wizytą",
  "en": "A few questions before your visit"
 },
 "survey_intro": {
  "pl": "Aby jak najlepiej przygotować się do Państwa wizyty, bylibyśmy bardzo wdzięczni za kilka informacji. Wystarczy odpowiedzieć na ten e-mail.",
  "en": "To make the most of your visit, we would appreciate a few details in advance. Simply reply to this email."
 },
 "survey_items": {
  "pl": [
   "Jak ma na imię Państwa dziecko?",
   "W którym roku się urodziło?",
   "Od kiedy chcieliby Państwo rozpocząć naukę? Już teraz czy od września?",
   "W jaki sposób dowiedzieli się Państwo o naszej placówce?",
   "Co najbardziej zwróciło Państwa uwagę w naszej ofercie?",
   "Jakie są Państwa oczekiwania wobec wizyty?"
  ],
  "en": [
   "What is your child's name?",
   "What year were they born?",
   "When would you like to start? Now or from September?",
   "How did you hear about us?",
   "What caught your attention most in our offer?",
   "What are your expectations for the visit?"
  ]
 },
 "visit_cta_title": {
  "pl": "Umów wizytę",
  "en": "Schedule your visit"
 },
 "visit_cta_desc": {
  "pl": "Chętnie pokażemy Państwu szkołę. Wybierz dogodny termin:",
  "en": "We'd love to show you around. Book a time that works for you:"
 },
 "visit_btn": {
  "pl": "Umów spotkanie →",
  "en": "Book a visit →"
 },
 "closing": {
  "pl": "W razie jakichkolwiek pytań pozostaję do Państwa dyspozycji.",
  "en": "If you have any questions, please feel free to get in touch."
 },
 "loc_names": {
  "katowice": "Katowice",
  "krakow": "Kraków",
  "wroclaw": "Wrocław"
 },
 "companion_msg": {
  "pl": "Dzień dobry,\nwysłałem informacje o szkole z adresu martin.g@maplebearpolska.pl - jakby się nie pojawiły, proszę sprawdzić folder SPAM.",
  "en": "Hi,\nI sent over information about the school from martin.g@maplebearpolska.pl - if it didn't show up, please check your SPAM folder."
 }
};
