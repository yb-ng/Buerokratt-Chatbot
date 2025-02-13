import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import {
  ColumnPinningState,
  createColumnHelper,
  PaginationState,
  SortingState,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { AxiosError } from 'axios';
import { MdOutlineRemoveRedEye } from 'react-icons/md';

import {
  Button,
  Card,
  DataTable,
  Dialog,
  Drawer,
  FormDatepicker,
  FormInput,
  FormMultiselect,
  HistoricalChat,
  Icon,
  Tooltip,
  Track,
} from 'components';
import { CHAT_EVENTS, CHAT_STATUS, Chat as ChatType } from 'types/chat';
import { useToast } from 'hooks/useToast';
import { apiDev } from 'services/api';
import useStore from 'store';
import { Controller, useForm } from 'react-hook-form';
import {
  getFromLocalStorage,
  setToLocalStorage,
} from 'utils/local-storage-utils';
import { CHAT_HISTORY_PREFERENCES_KEY } from 'constants/config';
import { useLocation } from 'react-router-dom';
import { unifyDateFromat } from './unfiyDate';
import withAuthorization from 'hoc/with-authorization';
import { ROLES } from 'utils/constants';
import { et } from 'date-fns/locale';

const ChatHistory: FC = () => {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const userInfo = useStore((state) => state.userInfo);
  const routerLocation = useLocation();
  const params = new URLSearchParams(routerLocation.search);
  let passedChatId = params.get('chat');
  const passedStartDate = params.get('start');
  const passedEndDate = params.get('end');
  const preferences = getFromLocalStorage(
    CHAT_HISTORY_PREFERENCES_KEY
  ) as string[];
  const [selectedChat, setSelectedChat] = useState<ChatType | null>(null);
  const [statusChangeModal, setStatusChangeModal] = useState<string | null>(
    null
  );

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [sorting, setSorting] = useState<SortingState>([]);
  const columnPinning: ColumnPinningState = {
    left: [],
    right: ['detail'],
  };
  const [totalPages, setTotalPages] = useState<number>(1);
  const [endedChatsList, setEndedChatsList] = useState<ChatType[]>([]);
  const [filteredEndedChatsList, setFilteredEndedChatsList] = useState<
    ChatType[]
  >([]);
  const [messagesTrigger, setMessagesTrigger] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    preferences ?? []
  );

  const { control, watch } = useForm<{
    startDate: Date | string;
    endDate: Date | string;
  }>({
    defaultValues: {
      startDate: passedStartDate
        ? unifyDateFromat(passedStartDate)
        : new Date(
            new Date().getUTCFullYear(),
            new Date().getUTCMonth(),
            new Date().getUTCDate()
          ),
      endDate: passedEndDate
        ? unifyDateFromat(passedEndDate)
        : new Date(
            new Date().getUTCFullYear(),
            new Date().getUTCMonth(),
            new Date().getUTCDate() + 1
          ),
    },
  });

  const startDate = watch('startDate');
  const endDate = watch('endDate');

  useEffect(() => {
    if (passedChatId != null) {
      getChatById.mutate();
      passedChatId = null;
    }
  }, [passedChatId]);

  useEffect(() => {
    getAllEndedChats.mutate({
      startDate: format(new Date(startDate), 'yyyy-MM-dd'),
      endDate: format(new Date(endDate), 'yyyy-MM-dd'),
      pagination,
      sorting,
    });
  }, []);

  const getAllEndedChats = useMutation({
    mutationFn: (data: {
      startDate: string;
      endDate: string;
      pagination: PaginationState;
      sorting: SortingState;
    }) =>
      apiDev.post('agents/chats/ended', {
        startDate: data.startDate,
        endDate: data.endDate,
        page: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
        sorting:
          sorting.length === 0
            ? 'created desc'
            : sorting[0].id + ' ' + (sorting[0].desc ? 'desc' : 'asc'),
      }),
    onSuccess: (res: any) => {
      setEndedChatsList(res.data.response ?? []);
      filterChatsList(res.data.response ?? []);
      setTotalPages(res?.data?.response[0]?.totalPages ?? 1);
    },
  });

  const getChatById = useMutation({
    mutationFn: () =>
      apiDev.post('chats/get', {
        chatId: passedChatId,
      }),
    onSuccess: (res: any) => {
      setSelectedChat(res.data.response);
    },
  });

  const visibleColumnOptions = useMemo(
    () => [
      { label: t('chat.history.startTime'), value: 'created' },
      { label: t('chat.history.endTime'), value: 'ended' },
      { label: t('chat.history.csaName'), value: 'customerSupportDisplayName' },
      { label: t('global.name'), value: 'endUserName' },
      { label: t('global.idCode'), value: 'endUserId' },
      { label: t('chat.history.contact'), value: 'contactsMessage' },
      { label: t('chat.history.comment'), value: 'comment' },
      { label: t('chat.history.rating'), value: 'feedbackRating' },
      { label: t('chat.history.feedback'), value: 'feedbackText' },
      { label: t('global.status'), value: 'status' },
      { label: 'ID', value: 'id' },
    ],
    [t]
  );

  const searchChatsMutation = useMutation({
    mutationFn: (searchKey: string) =>
      apiDev.post('chats/search', {
        searchKey: searchKey,
      }),
    onSuccess: (res: any) => {
      const responseList = (res.data.response ?? []).map(
        (item: any) => item.chatId
      );
      const filteredChats = endedChatsList.filter((item) =>
        responseList.includes(item.id)
      );
      filterChatsList(filteredChats);
    },
  });

  const chatStatusChangeMutation = useMutation({
    mutationFn: async (data: { chatId: string | number; event: string }) => {
      const changeableTo = [
        CHAT_EVENTS.CLIENT_LEFT_WITH_ACCEPTED.toUpperCase(),
        CHAT_EVENTS.CLIENT_LEFT_WITH_NO_RESOLUTION.toUpperCase(),
        CHAT_EVENTS.ACCEPTED.toUpperCase(),
        CHAT_EVENTS.ANSWERED.toUpperCase(),
        CHAT_EVENTS.CLIENT_LEFT_FOR_UNKNOWN_REASONS.toUpperCase(),
        CHAT_EVENTS.CLIENT_LEFT.toUpperCase(),
        CHAT_EVENTS.HATE_SPEECH.toUpperCase(),
        CHAT_EVENTS.OTHER.toUpperCase(),
        CHAT_EVENTS.TERMINATED.toUpperCase(),
        CHAT_EVENTS.RESPONSE_SENT_TO_CLIENT_EMAIL.toUpperCase(),
      ];
      const isChangeable = changeableTo.includes(data.event);

      if (selectedChat?.lastMessageEvent === data.event.toLowerCase()) return;

      if (!isChangeable) return;

      await apiDev.post('chats/status', {
        chatId: selectedChat!.id,
        event: data.event.toUpperCase(),
        authorTimestamp: new Date().toISOString(),
        authorFirstName: userInfo!.firstName,
        authorId: userInfo!.idCode,
        authorRole: userInfo!.authorities,
      });
    },
    onSuccess: () => {
      setMessagesTrigger(!messagesTrigger);
      getAllEndedChats.mutate({
        startDate: format(new Date(startDate), 'yyyy-MM-dd'),
        endDate: format(new Date(endDate), 'yyyy-MM-dd'),
        pagination,
        sorting,
      });
      toast.open({
        type: 'success',
        title: t('global.notification'),
        message: t('toast.success.chatStatusChanged'),
      });
      setStatusChangeModal(null);
    },
    onError: (error: AxiosError) => {
      toast.open({
        type: 'error',
        title: t('global.notificationError'),
        message: error.message,
      });
    },
    onSettled: () => setStatusChangeModal(null),
  });

  const chatCommentChangeMutation = useMutation({
    mutationFn: (data: { chatId: string | number; comment: string }) =>
      apiDev.post('comments/history', data),
    onSuccess: (res, { chatId, comment }) => {
      const updatedChatList = endedChatsList.map((chat) =>
        chat.id === chatId ? { ...chat, comment } : chat
      );
      filterChatsList(updatedChatList);
      if (selectedChat) setSelectedChat({ ...selectedChat, comment });
      toast.open({
        type: 'success',
        title: t('global.notification'),
        message: t('toast.success.chatCommentChanged'),
      });
    },
    onError: (error: AxiosError) => {
      toast.open({
        type: 'error',
        title: t('global.notificationError'),
        message: error.message,
      });
    },
  });

  const columnHelper = createColumnHelper<ChatType>();

  const copyValueToClipboard = async (value: string) => {
    await navigator.clipboard.writeText(value);

    toast.open({
      type: 'success',
      title: t('global.notification'),
      message: t('toast.success.copied'),
    });
  };

  const commentView = (props: any) =>
    props.getValue() && (
      <Tooltip content={props.getValue()}>
        <span
          onClick={() => copyValueToClipboard(props.getValue())}
          style={{ cursor: 'pointer' }}
        >
          {props.getValue().length <= 30
            ? props.getValue()
            : `${props.getValue()?.slice(0, 30)}...`}
        </span>
      </Tooltip>
    );

  const feedbackTextView = (props: any) => {
    const value = props.getValue() ?? '';

    return (
      <Tooltip content={value}>
        <span style={{ minWidth: '250px' }}>
          {value.length < 30 ? value : `${value?.slice?.(0, 30)}...`}
        </span>
      </Tooltip>
    );
  };

  const statusView = (props: any) => {
    const isLastMessageEvent =
      props.row.original.lastMessageEvent != null &&
      props.row.original.lastMessageEvent !== 'message-read'
        ? t('chat.plainEvents.' + props.row.original.lastMessageEvent)
        : t('chat.status.ended');
    return props.getValue() === CHAT_STATUS.ENDED ? isLastMessageEvent : '';
  };

  const idView = (props: any) => (
    <Tooltip content={props.getValue()}>
      <span
        onClick={() => copyValueToClipboard(props.getValue())}
        style={{ cursor: 'pointer' }}
      >
        {props.getValue().split('-')[0]}
      </span>
    </Tooltip>
  );

  const detailsView = (props: any) => (
    <Button
      appearance="text"
      onClick={() => setSelectedChat(props.row.original)}
    >
      <Icon icon={<MdOutlineRemoveRedEye color={'rgba(0,0,0,0.54)'} />} />
      {t('global.view')}
    </Button>
  );

  const endedChatsColumns = useMemo(
    () => [
      columnHelper.accessor('created', {
        id: 'created',
        header: t('chat.history.startTime') ?? '',
        cell: (props) =>
          format(
            new Date(props.getValue()),
            'dd.MM.yyyy HH:mm:ss',
            i18n.language === 'et' ? { locale: et } : undefined
          ),
      }),
      columnHelper.accessor('ended', {
        id: 'ended',
        header: t('chat.history.endTime') ?? '',
        cell: (props) =>
          format(
            new Date(props.getValue()),
            'dd.MM.yyyy HH:mm:ss',
            i18n.language === 'et' ? { locale: et } : undefined
          ),
      }),
      columnHelper.accessor('customerSupportDisplayName', {
        id: 'customerSupportDisplayName',
        header: t('chat.history.csaName') ?? '',
      }),
      columnHelper.accessor(
        (row) => `${row.endUserFirstName} ${row.endUserLastName}`,
        {
          id: `endUserName`,
          header: t('global.name') ?? '',
        }
      ),
      columnHelper.accessor('endUserId', {
        id: 'endUserId',
        header: t('global.idCode') ?? '',
      }),
      columnHelper.accessor('contactsMessage', {
        id: 'contactsMessage',
        header: t('chat.history.contact') ?? '',
        cell: (props) => (props.getValue() ? t('global.yes') : t('global.no')),
      }),
      columnHelper.accessor('comment', {
        id: 'comment',
        header: t('chat.history.comment') ?? '',
        cell: commentView,
      }),
      columnHelper.accessor('feedbackRating', {
        id: 'feedbackRating',
        header: t('chat.history.rating') ?? '',
        cell: (props) =>
          props.getValue() && <span>{`${props.getValue()}/10`}</span>,
      }),
      columnHelper.accessor('feedbackText', {
        id: 'feedbackText',
        header: t('chat.history.feedback') ?? '',
        cell: feedbackTextView,
      }),
      columnHelper.accessor('status', {
        id: 'status',
        header: t('global.status') ?? '',
        cell: statusView,
        sortingFn: (a, b, isAsc) => {
          const statusA =
            a.getValue('status') === CHAT_STATUS.ENDED
              ? t('chat.plainEvents.' + (a.original.lastMessageEvent ?? ''))
              : '';
          const statusB =
            b.getValue('status') === CHAT_STATUS.ENDED
              ? t('chat.plainEvents.' + (b.original.lastMessageEvent ?? ''))
              : '';
          return (
            statusA.localeCompare(statusB, undefined, {
              numeric: true,
              sensitivity: 'base',
            }) * (isAsc ? 1 : -1)
          );
        },
      }),
      columnHelper.accessor('id', {
        id: 'id',
        header: 'ID',
        cell: idView,
      }),
      columnHelper.display({
        id: 'detail',
        cell: detailsView,
        meta: {
          size: '1%',
          sticky: 'right',
        },
      }),
    ],
    []
  );

  const handleChatStatusChange = (event: string) => {
    if (!selectedChat) return;
    chatStatusChangeMutation.mutate({
      chatId: selectedChat.id,
      event: event.toUpperCase(),
    });
  };

  const handleCommentChange = (comment: string) => {
    if (!selectedChat) return;
    chatCommentChangeMutation.mutate({ chatId: selectedChat.id, comment });
  };

  const getFilteredColumns = () => {
    if (selectedColumns.length === 0) return endedChatsColumns;
    return endedChatsColumns.filter((c) =>
      ['detail', 'forward', ...selectedColumns].includes(c.id ?? '')
    );
  };

  const filterChatsList = (chatsList: ChatType[]) => {
    const startDate = Date.parse(
      format(new Date(control._formValues.startDate), 'MM/dd/yyyy')
    );

    const endDate = Date.parse(
      format(new Date(control._formValues.endDate), 'MM/dd/yyyy')
    );

    setFilteredEndedChatsList(
      chatsList.filter((c) => {
        const created = Date.parse(format(new Date(c.created), 'MM/dd/yyyy'));
        return created >= startDate && created <= endDate;
      })
    );
  };

  if (!filteredEndedChatsList) return <>Loading...</>;

  return (
    <>
      <h1>{t('chat.history.title')}</h1>

      <Card>
        <Track gap={16}>
          <FormInput
            label={t('chat.history.searchChats')}
            hideLabel
            name="searchChats"
            placeholder={t('chat.history.searchChats') + '...'}
            onChange={(e) =>
              e.target.value.length === 0
                ? filterChatsList(endedChatsList)
                : searchChatsMutation.mutate(e.target.value)
            }
          />
          <Track style={{ width: '100%' }} gap={16}>
            <Track gap={10}>
              <p>{t('global.from')}</p>
              <Controller
                name="startDate"
                control={control}
                render={({ field }) => {
                  return (
                    <FormDatepicker
                      {...field}
                      label={''}
                      value={field.value ?? new Date()}
                      onChange={(v) => {
                        field.onChange(v);
                        getAllEndedChats.mutate({
                          startDate: format(new Date(v), 'yyyy-MM-dd'),
                          endDate: format(new Date(endDate), 'yyyy-MM-dd'),
                          pagination,
                          sorting,
                        });
                      }}
                    />
                  );
                }}
              />
            </Track>
            <Track gap={10}>
              <p>{t('global.to')}</p>
              <Controller
                name="endDate"
                control={control}
                render={({ field }) => {
                  return (
                    <FormDatepicker
                      {...field}
                      label={''}
                      value={field.value ?? new Date()}
                      onChange={(v) => {
                        field.onChange(v);
                        getAllEndedChats.mutate({
                          startDate: format(new Date(startDate), 'yyyy-MM-dd'),
                          endDate: format(new Date(v), 'yyyy-MM-dd'),
                          pagination,
                          sorting,
                        });
                      }}
                    />
                  );
                }}
              />
            </Track>
            <FormMultiselect
              name="visibleColumns"
              label={t('')}
              options={visibleColumnOptions}
              selectedOptions={visibleColumnOptions.filter((o) =>
                selectedColumns.includes(o.value)
              )}
              onSelectionChange={(selection) => {
                const columns = selection?.map((s) => s.value) ?? [];
                setSelectedColumns(columns);
                setToLocalStorage(CHAT_HISTORY_PREFERENCES_KEY, columns);
              }}
            />
          </Track>
        </Track>
      </Card>

      <Card>
        <DataTable
          data={filteredEndedChatsList}
          sortable
          columns={getFilteredColumns()}
          pagination={pagination}
          columnPinning={columnPinning}
          sorting={sorting}
          setPagination={(state: PaginationState) => {
            if (
              state.pageIndex === pagination.pageIndex &&
              state.pageSize === pagination.pageSize
            )
              return;
            setPagination(state);
            getAllEndedChats.mutate({
              startDate: format(new Date(startDate), 'yyyy-MM-dd'),
              endDate: format(new Date(endDate), 'yyyy-MM-dd'),
              pagination: state,
              sorting,
            });
          }}
          setSorting={(state: SortingState) => {
            setSorting(state);
            getAllEndedChats.mutate({
              startDate: format(new Date(startDate), 'yyyy-MM-dd'),
              endDate: format(new Date(endDate), 'yyyy-MM-dd'),
              pagination,
              sorting: state,
            });
          }}
          isClientSide={false}
          pagesCount={totalPages}
        />
      </Card>

      {selectedChat && (
        <Drawer
          title={
            selectedChat.endUserFirstName !== '' &&
            selectedChat.endUserLastName !== ''
              ? `${selectedChat.endUserFirstName} ${selectedChat.endUserLastName}`
              : t('global.anonymous')
          }
          onClose={() => setSelectedChat(null)}
        >
          <HistoricalChat
            chat={selectedChat}
            trigger={messagesTrigger}
            onChatStatusChange={setStatusChangeModal}
            onCommentChange={handleCommentChange}
          />
        </Drawer>
      )}

      {statusChangeModal && (
        <Dialog
          title={t('chat.changeStatus')}
          onClose={() => setStatusChangeModal(null)}
          footer={
            <>
              <Button
                appearance="secondary"
                onClick={() => setStatusChangeModal(null)}
              >
                {t('global.cancel')}
              </Button>
              <Button
                appearance="error"
                onClick={() => handleChatStatusChange(statusChangeModal)}
              >
                {t('global.yes')}
              </Button>
            </>
          }
        >
          <p>{t('global.removeValidation')}</p>
        </Dialog>
      )}
    </>
  );
};

export default withAuthorization(ChatHistory, [
  ROLES.ROLE_ADMINISTRATOR,
  ROLES.ROLE_CUSTOMER_SUPPORT_AGENT,
]);
