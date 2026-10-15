import { getAccessToken } from './auth';

export interface CreatedFormResponse {
  formId: string;
  responderUri: string;
  editUri: string;
  title: string;
}

/**
 * Creates a real Google Form in the user's Google Drive populated with the
 * new 8-Step Merakifos Intake Questionnaire questions.
 */
export async function createGoogleDiscoveryForm(customTitle?: string): Promise<CreatedFormResponse> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Google authentication required. Please sign in to create a Google Form.');
  }

  const formTitle = customTitle?.trim() || 'Merakifos • A Little Context Before We Talk';

  // 1. Create the Form
  const createRes = await fetch('https://forms.googleapis.com/v1/forms', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      info: {
        title: formTitle,
        documentTitle: formTitle,
        description:
          'Grab a cup of coffee. This takes about two minutes, and it helps us dive straight into bringing your vision to life.',
      },
    }),
  });

  if (!createRes.ok) {
    const errorData = await createRes.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Failed to create Google Form (Status ${createRes.status})`
    );
  }

  const formData = await createRes.json();
  const formId = formData.formId;
  const responderUri = formData.responderUri || `https://docs.google.com/forms/d/${formId}/viewform`;
  const editUri = `https://docs.google.com/forms/d/${formId}/edit`;

  // 2. Add questionnaire items using batchUpdate
  const questionsBatch = [
    {
      createItem: {
        item: {
          title: 'Brand / Business Name',
          questionItem: {
            question: {
              required: true,
              textQuestion: { paragraph: false },
            },
          },
        },
        location: { index: 0 },
      },
    },
    {
      createItem: {
        item: {
          title: 'In your own words, what do you do, and who is your favorite kind of client to work with?',
          description: 'Just tell us like you were explaining it to a friend over lunch.',
          questionItem: {
            question: {
              required: true,
              textQuestion: { paragraph: true },
            },
          },
        },
        location: { index: 1 },
      },
    },
    {
      createItem: {
        item: {
          title: 'When someone lands on your new site or app, what’s the feeling you want them to get in the first five seconds?',
          description: 'Pick the 2 or 3 words that hit home for you.',
          questionItem: {
            question: {
              required: true,
              choiceQuestion: {
                type: 'CHECKBOX',
                options: [
                  { value: 'This is pure luxury and exclusivity.' },
                  { value: 'It feels warm, grounded, and deeply personal.' },
                  { value: 'Sleek, modern, and effortless to navigate.' },
                  { value: 'Romantic, artistic, and cinematic.' },
                  { value: 'Bold, fun, and brimming with personality.' },
                ],
              },
            },
          },
        },
        location: { index: 2 },
      },
    },
    {
      createItem: {
        item: {
          title: "Let's talk colors and visual taste. What shades feel like 'you,' and are there any you can't stand?",
          description: 'Tell us colors you love, shades to avoid, or paste a link to a Pinterest board or Instagram profile that feels like your world.',
          questionItem: {
            question: {
              required: false,
              textQuestion: { paragraph: true },
            },
          },
        },
        location: { index: 3 },
      },
    },
    {
      createItem: {
        item: {
          title: 'What visual pieces do you already have in your toolkit?',
          description: 'Be completely honest. There’s zero judgment whether you have a full hard drive or a blank slate.',
          questionItem: {
            question: {
              required: false,
              choiceQuestion: {
                type: 'CHECKBOX',
                options: [
                  { value: 'I have an official logo I love and want to keep' },
                  { value: 'I have professional photos or videos ready to showcase' },
                  { value: 'I have written out my service packages and \'About\' story' },
                  { value: 'I have glowing reviews and quotes from past clients' },
                  { value: 'Honestly? Almost nothing yet. I’d love Merakifos to build the look from scratch' },
                ],
              },
            },
          },
        },
        location: { index: 4 },
      },
    },
    {
      createItem: {
        item: {
          title: 'If this new platform could take one big headache off your plate every week, what would it handle?',
          description: 'Think about the repetitive things you spend too much time doing manually right now.',
          questionItem: {
            question: {
              required: false,
              choiceQuestion: {
                type: 'CHECKBOX',
                options: [
                  { value: 'Showing off the work: A stunning, visual gallery that does justice to what I actually create' },
                  { value: 'Stop the email ping-pong: Letting clients book discovery calls straight into my calendar' },
                  { value: 'Pre-qualifying leads: A short, custom inquiry form so I know their budget and date before we chat' },
                  { value: 'Getting paid seamlessly: Letting clients pay deposits, retainers, or packages online' },
                  { value: 'A private client home: A clean space where booked clients can view their timeline, files, or checklist' },
                  { value: 'Fast connection: Letting visitors message me directly via WhatsApp or Instagram in one tap' },
                ],
              },
            },
          },
        },
        location: { index: 5 },
      },
    },
    {
      createItem: {
        item: {
          title: 'Is there a website or app you secretly admire?',
          description: "Inside or outside your industry—whose vibe or seamless flow makes you think, 'I wish mine felt like this'?",
          questionItem: {
            question: {
              required: false,
              textQuestion: { paragraph: true },
            },
          },
        },
        location: { index: 6 },
      },
    },
    {
      createItem: {
        item: {
          title: 'Fast forward six months after launch. What would make you say, \'Hiring Merakifos was the best decision I made this year\'?',
          questionItem: {
            question: {
              required: false,
              textQuestion: { paragraph: true },
            },
          },
        },
        location: { index: 7 },
      },
    },
    {
      createItem: {
        item: {
          title: 'When would you love to see this live and out in the world?',
          questionItem: {
            question: {
              required: true,
              choiceQuestion: {
                type: 'RADIO',
                options: [
                  { value: 'As soon as humanly possible (next 4–6 weeks)' },
                  { value: 'In the next 2 to 3 months' },
                  { value: 'I’m flexible / quality-driven—let’s take the time to build it right' },
                ],
              },
            },
          },
        },
        location: { index: 8 },
      },
    },
    {
      createItem: {
        item: {
          title: 'What investment range feels comfortable for this project?',
          questionItem: {
            question: {
              required: true,
              choiceQuestion: {
                type: 'RADIO',
                options: [
                  { value: 'Less than $1000' },
                  { value: '$1,000 – $3,000' },
                  { value: '$3,000 – $6,000' },
                  { value: '$6000 - $12,000' },
                  { value: '$12,000+' },
                ],
              },
            },
          },
        },
        location: { index: 9 },
      },
    },
  ];

  // Ensure clean sequential locations for all batch items
  const indexedRequests = questionsBatch.map((req, index) => ({
    createItem: {
      item: req.createItem.item,
      location: { index },
    },
  }));

  try {
    const updateRes = await fetch(`https://forms.googleapis.com/v1/forms/${formId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests: indexedRequests }),
    });

    if (!updateRes.ok) {
      console.warn('Form created but failed to batch-populate questions:', await updateRes.text());
    }
  } catch (err) {
    console.warn('Could not populate form items:', err);
  }

  return {
    formId,
    responderUri,
    editUri,
    title: formTitle,
  };
}
