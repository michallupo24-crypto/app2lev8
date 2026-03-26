-- Create table for AI Tutor chat sessions
create table if not exists public.ai_chat_sessions (
    id uuid default gen_random_uuid() primary key,
    student_id uuid references public.profiles(id) on delete cascade not null,
    title text not null default 'שיחה חדשה',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Note: We could use RLS (Row Level Security) here, but since this is part of app2lev8 MVP, we enable it broadly for the student
alter table public.ai_chat_sessions enable row level security;

create policy "Students can view their own ai chat sessions"
    on public.ai_chat_sessions for select
    using (auth.uid() = student_id);

create policy "Students can insert their own ai chat sessions"
    on public.ai_chat_sessions for insert
    with check (auth.uid() = student_id);

create policy "Students can update their own ai chat sessions"
    on public.ai_chat_sessions for update
    using (auth.uid() = student_id);

create policy "Students can delete their own ai chat sessions"
    on public.ai_chat_sessions for delete
    using (auth.uid() = student_id);

-- Create table for messages within a session
create table if not exists public.ai_chat_messages (
    id uuid default gen_random_uuid() primary key,
    session_id uuid references public.ai_chat_sessions(id) on delete cascade not null,
    role text not null check (role in ('user', 'assistant', 'system')),
    content text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.ai_chat_messages enable row level security;

create policy "Students can view messages in their sessions"
    on public.ai_chat_messages for select
    using (
        exists (
            select 1 from public.ai_chat_sessions
            where id = ai_chat_messages.session_id
            and student_id = auth.uid()
        )
    );

create policy "Students can insert messages in their sessions"
    on public.ai_chat_messages for insert
    with check (
        exists (
            select 1 from public.ai_chat_sessions
            where id = ai_chat_messages.session_id
            and student_id = auth.uid()
        )
    );

-- Trigger for updating the chat session updated_at timestamp
create or function public.handle_ai_chat_message_insert()
returns trigger as $$
begin
  update public.ai_chat_sessions
  set updated_at = timezone('utc'::text, now())
  where id = new.session_id;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_ai_chat_message_insert
  after insert on public.ai_chat_messages
  for each row execute procedure public.handle_ai_chat_message_insert();
