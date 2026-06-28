-- Most fund sheets keep their running balance in A1, but some (e.g. "יחי ראובן")
-- keep it elsewhere on the sheet — make the lookup cell configurable per fund.
alter table funds add column balance_cell text not null default 'A1';
