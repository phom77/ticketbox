CREATE TABLE ticket_holds (
    id UUID PRIMARY KEY,
    concert_id UUID NOT NULL,
    user_id UUID NOT NULL,
    ticket_type_id UUID NOT NULL,
    quantity INT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_concert_ticket_type UNIQUE (user_id, concert_id, ticket_type_id)
);
